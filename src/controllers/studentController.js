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

module.exports = {
  getApprovedStudentCount,
  getApprovedStudents,
  updateStudentStatus,
  getStudentPerformance,
};
