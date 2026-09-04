const { prisma } = require('../config/db');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const quizService = require('../services/quiz.stub.service.js');

// This is deliberately an allow-list. Authentication fields must never leave
// the API when a teacher views students.
const safeStudentSelect = {
  id: true,
  studentCode: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const parsePositiveInt = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

/** GET /api/v1/students/count - approved STUDENT accounts only. */
const getApprovedStudentCount = catchAsync(async (req, res) => {
  const count = await prisma.user.count({
    where: { role: 'STUDENT', status: 'APPROVED' },
  });

  res.status(200).json({ status: 'success', data: { count } });
});

/** GET /api/v1/students?search=&page=&limit= - active and deactivated students. */
const getApprovedStudents = catchAsync(async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 100);
  const page = parsePositiveInt(req.query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInt(req.query.limit, 50, 100);
  const where = {
    role: 'STUDENT',
    status: { in: ['APPROVED', 'REJECTED'] },
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { studentCode: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [students, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: safeStudentSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    results: students.length,
    data: {
      students,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
});

/**
 * PATCH /api/v1/students/:id/status
 * Only permits APPROVED -> REJECTED and REJECTED -> APPROVED for students.
 * It changes no other field and deletes no related data.
 */
const updateStudentStatus = catchAsync(async (req, res, next) => {
  const targetStatus = String(req.body?.status || '').trim().toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(targetStatus)) {
    return next(new AppError('Invalid student status transition.', 400));
  }

  const student = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: safeStudentSelect,
  });

  if (!student) {
    return next(new AppError('Student not found.', 404));
  }
  if (student.role !== 'STUDENT') {
    return next(new AppError('Only student accounts can be updated here.', 400));
  }

  const isValidTransition =
    (student.status === 'APPROVED' && targetStatus === 'REJECTED') ||
    (student.status === 'REJECTED' && targetStatus === 'APPROVED');
  if (!isValidTransition) {
    return next(new AppError('This student status transition is not allowed.', 400));
  }

  const updatedStudent = await prisma.user.update({
    where: { id: student.id },
    data: { status: targetStatus },
    select: safeStudentSelect,
  });

  res.status(200).json({ status: 'success', data: { student: updatedStudent } });
});

/** DELETE /api/v1/students/:id - legacy handler; no dashboard route exposes it. */
const deleteStudent = catchAsync(async (req, res, next) => {
  const student = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, role: true },
  });

  if (!student) {
    return next(new AppError('لا يوجد طالب بالمعرّف المحدد.', 404));
  }
  if (student.role !== 'STUDENT') {
    return next(new AppError('يمكن حذف حسابات الطلاب فقط من خلال هذه النقطة.', 400));
  }

  // Quiz attempts store studentId as a plain string, but mistakes are a
  // student-owned dashboard record and must be removed with the account.
  await prisma.$transaction([
    prisma.studentMistake.deleteMany({ where: { studentId: student.id } }),
    prisma.user.delete({ where: { id: student.id } }),
  ]);

  res.status(200).json({
    success: true,
    message: 'تم حذف الطالب بنجاح.',
  });
});

/**
 * GET /api/v1/students/:id/performance - teacher-only student record view.
 *
 * Returns every exam grade + recorded mistake for ONE student, but ONLY for
 * quizzes created by the requesting teacher (ownership is enforced by scoping
 * on createdByTeacherId). Ungated by exam end_time on purpose — a teacher may
 * inspect a student's results & mistakes at any moment.
 */
const getStudentPerformance = catchAsync(async (req, res, next) => {
  const studentId = String(req.params.id || '').trim();

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: safeStudentSelect,
  });
  if (!student || student.role !== 'STUDENT') {
    return next(new AppError('لا يوجد طالب بالمعرّف المحدد.', 404));
  }

  // Ownership scope: only quizzes this teacher created may be reported.
  const teacherQuizzes = await quizService.getTeacherQuizzes(req.user.id);
  const ownedQuizIds = new Set(teacherQuizzes.map((q) => q.id));

  // Grades come from the attempt rows for quizzes owned by the teacher.
  const ownedAttempts = (await quizService.listAttemptsForStudent(studentId))
    .filter((a) => ownedQuizIds.has(a.quizId))
    .sort(
      (a, b) =>
        Date.parse(b.submittedAt || b.startedAt) -
        Date.parse(a.submittedAt || a.startedAt),
    );

  const quizById = new Map(teacherQuizzes.map((q) => [q.id, q]));
  const grades = ownedAttempts.map((attempt) => {
    const quiz = quizById.get(attempt.quizId) || {};
    const totalMcq = attempt.totalMcq || 0;
    return {
      resultId: attempt.id,
      quizId: attempt.quizId,
      quizTitle: quiz.title || 'اختبار',
      lessonId: quiz.lessonId || null,
      isMixed: Boolean(quiz.isMixed),
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      score: attempt.score,
      totalMcq,
      percent: totalMcq > 0 ? Math.round(((attempt.score || 0) / totalMcq) * 100) : null,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      submissionReason: attempt.submissionReason,
    };
  });

  // Mistakes, scoped to the teacher's own quizzes (same ownership rule).
  const mistakes = await prisma.studentMistake.findMany({
    where: { studentId, quizId: { in: [...ownedQuizIds] } },
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { quiz: { select: { title: true } }, question: { select: { text: true } } },
  });

  res.status(200).json({
    status: 'success',
    data: {
      student: {
        id: student.id,
        name: student.name,
        studentCode: student.studentCode,
        email: student.email,
        status: student.status,
        createdAt: student.createdAt,
      },
      ownedQuizCount: teacherQuizzes.length,
      grades,
      mistakes: mistakes.map((mistake) => ({
        id: mistake.id,
        quizId: mistake.quizId,
        quizTitle: mistake.quiz.title,
        questionId: mistake.questionId,
        questionText: mistake.question.text,
        studentAnswer: mistake.studentAnswer,
        correctAnswer: mistake.correctAnswer,
        createdAt: mistake.createdAt,
      })),
    },
  });
});

/**
 * GET /api/v1/students/scoreboard - teacher-only cumulative performance board.
 *
 * Visible ONLY to the teacher because the whole /api/v1/students router is
 * mounted behind (protect, restrictTo('TEACHER')) in studentRoutes.js — a
 * student hitting this endpoint gets a 403 before any data is computed.
 *
 * RANKING LOGIC (documented for consistency):
 *   - A student's score for a given quiz = their BEST submitted attempt
 *     (grant-retry gives 1..N attempts; only the top one counts, matching the
 *     existing per-quiz leaderboard rule).
 *   - totalScore      = sum of best scores across ALL quizzes.
 *   - totalPossible   = sum of totalMcq (questions) across those quizzes.
 *     Because quizzes vary in length, the reporter (easier visual
 *     comparison) is the overall percentage = totalScore / totalPossible.
 *   - examsCompleted  = number of quizzes the student has at least one
 *     submitted attempt on (a student who never attempted a quiz simply does
 *     not contribute to that quiz).
 *   - avgPercent      = mean of the student's per-quiz best-attempt
 *     percentages (each quiz weighted equally) — a fairer "class average"
 *     than the raw total ratio when quiz lengths differ.
 *   - rank            = competition ranking: highest totalScore first;
 *     equal totalScores SHARE the same rank and the next rank is skipped
 *     (1, 2, 2, 4 ...). Ties are broken by name for a stable, deterministic
 *     display order but the shared numeric rank stays identical.
 *   - highest / lowest = best and worst per-quiz best-score percentage.
 *
 * No data is duplicated or denormalised: this endpoint aggregates live from
 * the existing quiz_attempts rows, so it always reflects current grades and
 * never needs a separate table.
 */
const getScoreboard = catchAsync(async (req, res, next) => {
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', status: 'APPROVED' },
    select: {
      id: true,
      studentCode: true,
      name: true,
      email: true,
      status: true,
      createdAt: true,
    },
    orderBy: { name: 'asc' },
  });

  if (!students.length) {
    return res.status(200).json({
      status: 'success',
      data: { students: [], generatedAt: new Date().toISOString() },
    });
  }

  const attempts = await quizService.getAllSubmittedAttemptsWithQuiz();
  const quizIds = await quizService.quizIdsFromAttempts(attempts);

  // Quiz metadata (title, possible questions) only for quizzes that actually
  // have submitted results — never computes against empty collections.
  const [quizRows, lessonRows] = await Promise.all([
    prisma.quiz.findMany({
      where: { id: { in: quizIds } },
      select: { id: true, title: true, questionCount: true },
    }),
    quizIds.length
      ? prisma.quizLesson.findMany({
          where: { quizId: { in: quizIds } },
          select: { quizId: true, lessonId: true },
        })
      : Promise.resolve([]),
  ]);

  // best submitted score per (student, quiz) + per-quiz possible tally.
  const bestByStudentQuiz = new Map(); // `${studentId}::${quizId}` -> {score,totalMcq}
  for (const attempt of attempts) {
    const key = `${attempt.studentId}::${attempt.quizId}`;
    const existing = bestByStudentQuiz.get(key);
    const score = attempt.score || 0;
    const totalMcq = attempt.totalMcq || 0;
    if (!existing || score > existing.score) {
      bestByStudentQuiz.set(key, { score, totalMcq });
    }
  }

  const quizById = new Map(quizRows.map((q) => [q.id, q]));

  // Aggregate per student.
  const rows = students.map((student) => {
    let totalScore = 0;
    let totalPossible = 0;
    let quizzesCompleted = 0;
    const bestPercents = [];

    for (const key of bestByStudentQuiz.keys()) {
      if (!key.startsWith(`${student.id}::`)) continue;
      const { score, totalMcq } = bestByStudentQuiz.get(key);
      quizzesCompleted += 1;
      totalScore += score;
      totalPossible += totalMcq;
      if (totalMcq > 0) {
        bestPercents.push(Math.round((score / totalMcq) * 1000) / 10);
      }
    }

    const overallPercent =
      totalPossible > 0
        ? Math.round((totalScore / totalPossible) * 1000) / 10
        : null;
    const avgPercent =
      bestPercents.length > 0
        ? Math.round(
            (bestPercents.reduce((sum, p) => sum + p, 0) / bestPercents.length) *
              10,
          ) / 10
        : null;
    const highest =
      bestPercents.length > 0 ? Math.max(...bestPercents) : null;
    const lowest = bestPercents.length > 0 ? Math.min(...bestPercents) : null;

    return {
      studentId: student.id,
      name: student.name,
      studentCode: student.studentCode,
      email: student.email,
      totalScore,
      totalPossible,
      overallPercent,
      avgPercent,
      examsCompleted: quizzesCompleted,
      highest,
      lowest,
    };
  });

  // Competition (1224) ranking by totalScore, name tie-break for display.
  rows.sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      a.name.localeCompare(b.name, 'ar'),
  );
  let currentRank = 1;
  for (let i = 0; i < rows.length; i += 1) {
    if (
      i > 0 &&
      rows[i].totalScore === rows[i - 1].totalScore
    ) {
      // tied with the previous student — share its rank
      rows[i].rank = rows[i - 1].rank;
    } else {
      rows[i].rank = currentRank;
    }
    currentRank += 1;
  }

  // Individual quiz results per student (for the detail view) — only the
  // student's own submitted attempts, best attempt per quiz.
  const quizzesSummary = quizRows.map((quiz) => ({
    quizId: quiz.id,
    title: quiz.title,
    questionCount: quiz.questionCount,
    lessonId: lessonRows
      .filter((l) => l.quizId === quiz.id)
      .map((l) => l.lessonId),
  }));

  res.status(200).json({
    status: 'success',
    data: {
      generatedAt: new Date().toISOString(),
      students: rows,
      quizzes: quizzesSummary,
    },
  });
});

module.exports = {
  getApprovedStudentCount,
  getApprovedStudents,
  updateStudentStatus,
  getStudentPerformance,
  getScoreboard,
};
