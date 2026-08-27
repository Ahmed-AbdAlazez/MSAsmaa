/**
 * quiz.service.js  (was quiz.stub.service.js)
 * ===========================================================================
 * REAL DATABASE PERSISTENCE for every read/write the QUIZ feature needs.
 *
 * The former in-memory Maps are gone: quizzes survive server restarts and
 * serverless cold starts, and all server instances see the same data via
 * Neon Postgres through Prisma.
 *
 * CONTRACT (unchanged): names, parameters and return shapes are IDENTICAL
 * to the stub this file replaced â€” routes/tests import from THIS path and
 * required zero changes. Every returned record still exposes ISO strings
 * for timestamps (Date.parse-friendly), questions carry choices with stable
 * ids ("c1".."c4"), attempts double as results (resultId == attempt id),
 * and attempt.answers keeps the { [questionId]: { value, updatedAt } } map.
 *
 * PRISMA TABLES (prisma/schema.prisma):
 *   Quiz           -> quizzes               (quiz metadata)
 *   QuizQuestion   -> questions             (+ correctChoiceId/modelAnswer)
 *   QuizChoice     -> choices               (stable key "c1".."c4" per question)
 *   QuizAttempt    -> quiz_attempts         (in_progress OR submitted = result)
 *   StudentAnswer  -> student_answers       (autosave/resume rows)
 *   QuizExtraAttempt -> quiz_extra_attempts (teacher-granted retries)
 *
 * Deliberately NOT foreign keys: lessonId/courseId/studentId are plain
 * strings because lessons/courses tables do not exist yet and attempt rows
 * may reference JWT subjects that predate a users row (test rosters).
 *
 * Test-only helpers kept from the stub era (documented below):
 *   setStudentNameForTesting  - display-name overlay used by the suites
 *   setCourseRosterForTesting - roster overlay used by the suites
 * ===========================================================================
 */

/* ------------------------------------------------------------------ *
 * PRISMA CLIENT — shared singleton from config/db.js
 * Uses the globalThis-cached instance to avoid connection pool
 * exhaustion on Vercel serverless + Neon.
 * ------------------------------------------------------------------ */
const { prisma: getPrisma } = require('../config/db');

/**
 * Runs a Prisma call again when Neon's cold start / transient networking
 * drops it. Up to RETRY_ATTEMPTS tries with linear backoff — a single retry
 * proved insufficient during real connection blips, which students
 * experienced as exams randomly failing to load.
 */
const RETRYABLE_FRAGMENTS = [
  "Can't reach database server",
  "Timed out fetching",
];

async function withColdStartRetry(operation) {
  const MAX_TRIES = 3;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = String(error && error.message);
      const retryable =
        error &&
        (
          (typeof error.code === "string" && error.code.startsWith("P")) ||
          error.name === "PrismaClientInitializationError" ||
          message.includes("connection pool") ||
          RETRYABLE_FRAGMENTS.some((fragment) => message.includes(fragment))
        );
      if (!retryable || attempt >= MAX_TRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
}

/* ------------------------------------------------------------------ *
 * TEST-ONLY OVERLAYS (in-memory, process-local, suite seeding only)
 * ------------------------------------------------------------------ */

/** Display-name overlay consulted BEFORE the users table fallback. */
const studentNamesById = new Map();

/** Roster overlay for leaderboards ("never attempted" students at zero). */
const courseRosterByCourseId = new Map();

/* ------------------------------------------------------------------ *
 * ROW -> RECORD MAPPERS (preserve the stub's ISO-string contracts)
 * ------------------------------------------------------------------ */

function mapQuiz(row) {
  return {
    id: row.id,
    createdByTeacherId: row.createdByTeacherId || null,
    lessonId: row.lessonId,
    courseId: row.courseId,
    isMixed: row.isMixed || false,
    title: row.title,
    questionCount: row.questionCount,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    durationMinutes: row.durationMinutes,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapQuestion(row) {
  const question = {
    id: row.id,
    quizId: row.quizId,
    order: row.order,
    type: row.type,
    text: row.text,
    imagePath: row.imagePath,
  };
  if (row.type === "mcq") {
    question.choices = [...row.choices]
      .sort(
        (a, b) =>
          Number(a.key.slice(1)) - Number(b.key.slice(1))
      )
      .map((choice) => ({ id: choice.key, text: choice.text }));
    question.correctChoiceId = row.correctChoiceId;
  } else {
    question.modelAnswer = row.modelAnswer;
  }
  return question;
}

function mapAttempt(row) {
  const answers = {};
  for (const answer of row.answers || []) {
    answers[answer.questionId] = {
      value: answer.value,
      updatedAt: answer.updatedAt.toISOString(),
    };
  }
  return {
    id: row.id,
    quizId: row.quizId,
    studentId: row.studentId,
    attemptNumber: row.attemptNumber,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    personalDeadline: row.personalDeadline.toISOString(),
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    submissionReason: row.submissionReason,
    score: row.score,
    totalMcq: row.totalMcq,
    // Persisted server-side shuffle (question/choice order); the taking
    // routes read this on resume so students see their exact arrangement.
    ordering: row.ordering === null ? undefined : row.ordering,
    answers,
  };
}

const ATTEMPT_INCLUDE = { answers: true };

/* ------------------------------------------------------------------ *
 * QUIZZES
 * ------------------------------------------------------------------ */

/**
 * Creates and stores a quiz attached to a lesson (or multiple lessons for mixed quizzes).
 * @param {object} input - { lessonId?, courseId?, title, questionCount,
 *                          startTime, endTime, durationMinutes,
 *                          isMixed?, lessonIds? }
 * @returns {Promise<object>} The stored quiz record.
 */
async function createQuiz(input) {
  const isMixed = Boolean(input.isMixed);
  const lessonIds = Array.isArray(input.lessonIds) ? input.lessonIds : [];

  const row = await getPrisma().quiz.create({
    data: {
      lessonId: isMixed ? null : (input.lessonId ? String(input.lessonId) : null),
      createdByTeacherId: input.createdByTeacherId
        ? String(input.createdByTeacherId)
        : null,
      courseId: input.courseId ? String(input.courseId) : null,
      isMixed,
      title: String(input.title).trim(),
      questionCount: Number(input.questionCount),
      startTime: new Date(input.startTime),
      endTime: new Date(input.endTime),
      durationMinutes: Number(input.durationMinutes),
      // Create quiz_lessons join rows for mixed quizzes
      ...(isMixed && lessonIds.length > 0
        ? {
            quizLessons: {
              create: lessonIds.map((lid) => ({ lessonId: String(lid) })),
            },
          }
        : {}),
    },
  });
  return mapQuiz(row);
}

/**
 * Returns the lesson IDs associated with a mixed quiz.
 * @param {string} quizId
 * @returns {Promise<string[]>}
 */
async function getQuizLessons(quizId) {
  const rows = await getPrisma().quizLesson.findMany({
    where: { quizId: String(quizId) },
    select: { lessonId: true },
  });
  return rows.map((r) => r.lessonId);
}

/**
 * Returns quiz_lessons rows with lesson info for multiple quizzes at once (batch).
 * @param {string[]} quizIds
 * @returns {Promise<Map<string, string[]>>} Map of quizId -> lessonId[]
 */
async function getQuizLessonsBatch(quizIds) {
  if (!quizIds.length) return new Map();
  const rows = await getPrisma().quizLesson.findMany({
    where: { quizId: { in: quizIds } },
    select: { quizId: true, lessonId: true },
  });
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.quizId)) map.set(row.quizId, []);
    map.get(row.quizId).push(row.lessonId);
  }
  return map;
}

/**
 * Lists quizzes (Exams Hub feed source), soonest-starting first.
 *
 * @param {object} [options]
 * @param {string} [options.courseId] - Optional filter. The hub passes its
 *   course so rows from other courses (e.g. synthetic data created by
 *   automated tests) can never leak into a course page.
 * @returns {Promise<object[]>}
 */
async function listAllQuizzes({ courseId } = {}) {
  const rows = await getPrisma().quiz.findMany({
    where: courseId ? { courseId: String(courseId) } : undefined,
    orderBy: { startTime: "desc" },
    take: 100,
  });
  return rows.map(mapQuiz);
}

/**
 * Reads one quiz by ID.
 * @param {string} quizId
 * @returns {Promise<object|null>}
 */
async function getQuizById(quizId) {
  const row = await getPrisma().quiz.findUnique({ where: { id: String(quizId) } });
  return row ? mapQuiz(row) : null;
}

/**
 * Lists all quizzes of one lesson, newest first. Excludes mixed quizzes
 * (they appear in their own dedicated section on the student hub).
 * @param {string} lessonId
 * @returns {Promise<object[]>}
 */
async function getQuizzesForLesson(lessonId) {
  const rows = await getPrisma().quiz.findMany({
    where: { lessonId: String(lessonId), isMixed: false },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapQuiz);
}

/**
 * Returns mixed quizzes that include the given lesson via the QuizLesson
 * join table. Used by the lesson page exams tab.
 * @param {string} lessonId
 * @returns {Promise<object[]>}
 */
async function getMixedQuizzesForLesson(lessonId) {
  const rows = await getPrisma().quizLesson.findMany({
    where: { lessonId: String(lessonId) },
    include: { quiz: true },
  });
  return rows
    .filter((r) => r.quiz && r.quiz.isMixed)
    .map((r) => mapQuiz(r.quiz));
}

/**
 * Lists all quizzes belonging to one course.
 * @param {string} courseId
 * @returns {Promise<object[]>}
 */
async function getQuizzesForCourse(courseId) {
  const rows = await getPrisma().quiz.findMany({
    where: { courseId: String(courseId) },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapQuiz);
}

/* ------------------------------------------------------------------ *
 * QUESTIONS
 * ------------------------------------------------------------------ */

/**
 * Adds one question to a quiz (enforces existence + declared limit).
 * MCQ choices are normalized into stable choice objects ({id:"cN", text}).
 * @param {string} quizId
 * @param {object} input - Validated question fields (see creation routes).
 * @returns {Promise<object>} The stored question record.
 */
async function addQuestionToQuiz(quizId, input) {
  const quiz = await getPrisma().quiz.findUnique({ where: { id: String(quizId) } });
  if (!quiz) throw new Error("QUIZ_NOT_FOUND");

  const existingCount = await getPrisma().quizQuestion.count({
    where: { quizId: quiz.id },
  });
  if (existingCount >= quiz.questionCount) {
    throw new Error("QUIZ_QUESTION_LIMIT_REACHED");
  }

  const data = {
    quizId: quiz.id,
    order: existingCount + 1,
    type: input.type, // "mcq" | "written"
    text: String(input.text).trim(),
    imagePath: input.imagePath ? String(input.imagePath) : null,
  };

  if (input.type === "mcq") {
    const choices = input.choices.map((text, index) => ({
      key: `c${index + 1}`,
      text: String(text).trim(),
    }));
    data.correctChoiceId = choices[input.correctIndex].key;
    data.choices = { create: choices };
  } else {
    // Written questions keep the model answer purely for LATER DISPLAY.
    // It is never graded, never compared, never scored â€” anywhere.
    data.modelAnswer = String(input.modelAnswer).trim();
  }

  const row = await getPrisma().quizQuestion.create({
    data,
    include: { choices: true },
  });
  return mapQuestion(row);
}

/**
 * ALL questions of a quiz WITH correct answers / model answers, in order.
 * âš ï¸ Caller responsibility: student-facing routes must sanitize via
 * quiz.helpers sanitizeQuestionForStudent() before responding.
 * @param {string} quizId
 * @returns {Promise<object[]>}
 */
async function getQuestionsForQuiz(quizId) {
  const rows = await getPrisma().quizQuestion.findMany({
    where: { quizId: String(quizId) },
    orderBy: { order: "asc" },
    include: { choices: true },
  });
  return rows.map(mapQuestion);
}

/* ------------------------------------------------------------------ *
 * ATTEMPTS (one row per attempt; supports resume + granted retries)
 * ------------------------------------------------------------------ */

/**
 * Creates a NEW in-progress attempt. Server records start time AND personal
 * cutoff; never trusted from the client.
 * @param {string} quizId
 * @param {string} studentId
 * @param {string} personalDeadline - ISO instant when their countdown ends.
 * @returns {Promise<object>} The fresh attempt record.
 */
async function createAttempt(quizId, studentId, personalDeadline) {
  const previousCount = await getPrisma().quizAttempt.count({
    where: { quizId: String(quizId), studentId: String(studentId) },
  });

  const row = await getPrisma().quizAttempt.create({
    data: {
      quizId: String(quizId),
      studentId: String(studentId),
      attemptNumber: previousCount + 1,
      status: "in_progress",
      startedAt: new Date(),
      personalDeadline: new Date(personalDeadline),
    },
    include: ATTEMPT_INCLUDE,
  });
  return mapAttempt(row);
}

/**
 * All attempts (any status) one student has for one quiz, oldest first.
 * @param {string} quizId
 * @param {string} studentId
 * @returns {Promise<object[]>}
 */
async function getAttemptsForStudent(quizId, studentId) {
  const rows = await getPrisma().quizAttempt.findMany({
    where: { quizId: String(quizId), studentId: String(studentId) },
    orderBy: { attemptNumber: "asc" },
    include: ATTEMPT_INCLUDE,
  });
  return rows.map(mapAttempt);
}

/**
 * All attempts (any status, any quiz) for ONE student, oldest first.
 * Powers the Exams Hub per-student attempt feed (GET /quizzes/my-attempts)
 * so the UI can distinguish not-attempted / attempted exams without N
 * per-quiz probes.
 * @param {string} studentId
 * @returns {Promise<object[]>}
 */
async function listAttemptsForStudent(studentId) {
  const rows = await getPrisma().quizAttempt.findMany({
    where: { studentId: String(studentId) },
    orderBy: { startedAt: "desc" },
    take: 100, // safety cap — a student is unlikely to exceed this
    include: ATTEMPT_INCLUDE,
  });
  return rows.map(mapAttempt);
}

/**
 * Finds one attempt by its ID (the "result id" of review endpoints).
 * @param {string} resultId
 * @returns {Promise<object|null>}
 */
async function getAttemptById(resultId) {
  const row = await getPrisma().quizAttempt.findUnique({
    where: { id: String(resultId) },
    include: ATTEMPT_INCLUDE,
  });
  return row ? mapAttempt(row) : null;
}

/**
 * Saves ONE answer for an IN-PROGRESS attempt (autosave on every change).
 * Silently ignores writes after submission â€” a late autosave from a closing
 * tab must never mutate a graded result.
 * @param {string} attemptId
 * @param {string} questionId
 * @param {string} value - Choice key (mcq) or free text (written).
 * @returns {Promise<boolean>} true if saved, false otherwise.
 */
async function saveInProgressAnswer(attemptId, questionId, value) {
  const attempt = await getPrisma().quizAttempt.findUnique({
    where: { id: String(attemptId) },
    select: { status: true },
  });
  if (!attempt || attempt.status !== "in_progress") return false;

  const data = { value: String(value == null ? "" : value) };
  await getPrisma().studentAnswer.upsert({
    where: {
      attemptId_questionId: {
        attemptId: String(attemptId),
        questionId: String(questionId),
      },
    },
    update: data,
    create: {
      attemptId: String(attemptId),
      questionId: String(questionId),
      ...data,
    },
  });
  return true;
}

/**
 * Persists the server-generated per-attempt shuffle (question + choice
 * orders). The taking routes call this right after createAttempt so a
 * resume replays the exact same arrangement. Kept separate from
 * createAttempt to preserve that function's original signature.
 * @param {string} attemptId
 * @param {object} ordering - { questionOrder: string[], choiceOrders: object }
 * @returns {Promise<object>} The updated attempt record.
 */
async function setAttemptOrdering(attemptId, ordering) {
  const row = await getPrisma().quizAttempt.update({
    where: { id: String(attemptId) },
    data: { ordering },
    include: ATTEMPT_INCLUDE,
  });
  return mapAttempt(row);
}

/**
 * Marks an attempt submitted and stores its final graded outcome
 * (manual AND auto submits). Returns null when missing/already submitted.
 * @param {string} attemptId
 * @param {object} result - { score, totalMcq, reason, submittedAt }
 * @returns {Promise<object|null>}
 */
async function finalizeAttempt(attemptId, result) {
  const existing = await getPrisma().quizAttempt.findUnique({
    where: { id: String(attemptId) },
    select: { status: true },
  });
  if (!existing || existing.status === "submitted") return null;

  const row = await getPrisma().quizAttempt.update({
    where: { id: String(attemptId) },
    data: {
      status: "submitted",
      score: Number(result.score),
      totalMcq: Number(result.totalMcq),
      submissionReason: String(result.reason),
      submittedAt: result.submittedAt
        ? new Date(result.submittedAt)
        : new Date(),
    },
    include: ATTEMPT_INCLUDE,
  });
  return mapAttempt(row);
}

/**
 * Count of SUBMITTED attempts a student has used on a quiz.
 * @param {string} quizId
 * @param {string} studentId
 * @returns {Promise<number>}
 */
async function countSubmittedAttempts(quizId, studentId) {
  return getPrisma().quizAttempt.count({
    where: {
      quizId: String(quizId),
      studentId: String(studentId),
      status: "submitted",
    },
  });
}

/**
 * Total allowed attempts: 1 by default + persisted teacher-granted extras.
 * @param {string} quizId
 * @param {string} studentId
 * @returns {Promise<number>}
 */
async function getAllowedAttemptCount(quizId, studentId) {
  const row = await getPrisma().quizExtraAttempt.findUnique({
    where: {
      quizId_studentId: { quizId: String(quizId), studentId: String(studentId) },
    },
  });
  return 1 + (row ? row.extraCount : 0);
}

/**
 * Batch allowed-attempt counts for multiple students on one quiz.
 * Returns a Map<studentId, count> — single query instead of N.
 * @param {string} quizId
 * @param {string[]} studentIds
 * @returns {Promise<Map<string, number>>}
 */
async function getAllowedAttemptCounts(quizId, studentIds) {
  if (!studentIds.length) return new Map();
  const rows = await getPrisma().quizExtraAttempt.findMany({
    where: {
      quizId: String(quizId),
      studentId: { in: studentIds.map(String) },
    },
  });
  const extraMap = new Map(rows.map((r) => [r.studentId, r.extraCount]));
  return new Map(
    studentIds.map((id) => [String(id), 1 + (extraMap.get(String(id)) || 0)])
  );
}

/**
 * Teacher grants ONE additional attempt to a student for a quiz (persistent;
 * calling twice grants two). Returns the new total allowance.
 * @param {string} quizId
 * @param {string} studentId
 * @returns {Promise<number>}
 */
async function grantAdditionalAttempt(quizId, studentId) {
  const row = await getPrisma().quizExtraAttempt.upsert({
    where: {
      quizId_studentId: { quizId: String(quizId), studentId: String(studentId) },
    },
    update: { extraCount: { increment: 1 } },
    create: {
      quizId: String(quizId),
      studentId: String(studentId),
      extraCount: 1,
    },
  });
  return 1 + row.extraCount;
}

/* ------------------------------------------------------------------ *
 * RESULTS & ROSTERS (leaderboard inputs)
 * ------------------------------------------------------------------ */

/**
 * ALL attempts for a quiz regardless of status or student.
 * @param {string} quizId
 * @returns {Promise<object[]>}
 */
async function getAllAttemptsForQuiz(quizId) {
  const rows = await getPrisma().quizAttempt.findMany({
    where: { quizId: String(quizId) },
    orderBy: { startedAt: "asc" },
    include: ATTEMPT_INCLUDE,
  });
  return rows.map(mapAttempt);
}

/**
 * SUBMITTED results across every student for one quiz (leaderboards +
 * teacher results view).
 * @param {string} quizId
 * @returns {Promise<object[]>}
 */
async function getSubmittedResultsForQuiz(quizId) {
  const rows = await getPrisma().quizAttempt.findMany({
    where: { quizId: String(quizId), status: "submitted" },
    orderBy: { startedAt: "asc" },
    include: ATTEMPT_INCLUDE,
  });
  return rows.map(mapAttempt);
}

/**
 * Display name for a student id: users table first, then the test-only
 * overlay, then a short-id fallback.
 * @param {string} studentId - The user id from the JWT.
 * @returns {Promise<string>}
 */
async function getStudentNameById(studentId) {
  const key = String(studentId);
  const user = await getPrisma().user.findUnique({
    where: { id: key },
    select: { name: true },
  });
  if (user && user.name) return user.name;
  return (
    studentNamesById.get(key) || `Ø·Ø§Ù„Ø¨ ${key.slice(0, 6)}`
  );
}

/**
 * Batch display names for multiple student ids — single query instead
 * of N individual lookups (fixes N+1 in leaderboards).
 * @param {string[]} studentIds
 * @returns {Promise<Map<string, string>>} id → display name
 */
async function getStudentNamesByIds(studentIds) {
  if (!studentIds.length) return new Map();
  const ids = [...new Set(studentIds.map(String))];
  const users = await getPrisma().user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(users.map((u) => [u.id, u.name]));
  // Fill gaps with test overlay or fallback
  for (const id of ids) {
    if (!nameMap.has(id)) {
      nameMap.set(id, studentNamesById.get(id) || `Ø·Ø§Ù„Ø¨ ${id.slice(0, 6)}`);
    }
  }
  return nameMap;
}

/**
 * TEST-ONLY helper: seeds a display-name overlay without touching auth.
 */
function setStudentNameForTesting(studentId, name) {
  studentNamesById.set(String(studentId), String(name));
}

/**
 * Roster: every student enrolled in a course. Only used to add
 * "never attempted" students to leaderboards with a zero score.
 * NOTE: there is no enrollments table yet (that stub remains the single
 * source for ACCESS checks); until it exists this returns the process-local
 * seeded roster (empty on fresh instances).
 * @param {string} courseId
 * @returns {Promise<string[]>}
 */
async function getStudentIdsForCourse(courseId) {
  return [...(courseRosterByCourseId.get(String(courseId)) || [])];
}

/**
 * TEST-ONLY helper: seeds the course-roster overlay for leaderboards.
 */
function setCourseRosterForTesting(courseId, studentIds) {
  courseRosterByCourseId.set(String(courseId), [...studentIds]);
}

/**
 * Get all quizzes created by a specific teacher.
 * @param {string} teacherId
 * @returns {Promise<object[]>}
 */
async function getTeacherQuizzes(teacherId) {
  const quizzes = await getPrisma().quiz.findMany({
    where: { createdByTeacherId: String(teacherId) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return quizzes.map(mapQuiz);
}

async function getTeacherQuiz(quizId, teacherId) {
  const quiz = await getPrisma().quiz.findFirst({
    where: { id: String(quizId), createdByTeacherId: String(teacherId) },
  });
  return quiz ? mapQuiz(quiz) : null;
}

/**
 * Delete an entire quiz and all its related data (questions, attempts, etc).
 * @param {string} quizId
 * @returns {Promise<boolean>}
 */
async function deleteQuiz(quizId) {
  try {
    // Delete in cascading order
    await getPrisma().studentAnswer.deleteMany({
      where: {
        attempt: {
          quizId: String(quizId),
        },
      },
    });

    await getPrisma().quizAttempt.deleteMany({
      where: { quizId: String(quizId) },
    });

    await getPrisma().quizExtraAttempt.deleteMany({
      where: { quizId: String(quizId) },
    });

    await getPrisma().quizChoice.deleteMany({
      where: {
        question: {
          quizId: String(quizId),
        },
      },
    });

    await getPrisma().quizQuestion.deleteMany({
      where: { quizId: String(quizId) },
    });

    await getPrisma().quizLesson.deleteMany({
      where: { quizId: String(quizId) },
    });

    await getPrisma().quiz.delete({
      where: { id: String(quizId) },
    });

    return true;
  } catch (err) {
    console.error(`[deleteQuiz] error for ${quizId}:`, err.message);
    return false;
  }
}

/**
 * Delete a single question from a quiz.
 * @param {string} quizId
 * @param {string} questionId
 * @returns {Promise<boolean>}
 */
async function deleteQuestionFromQuiz(quizId, questionId) {
  try {
    const question = await getPrisma().quizQuestion.findFirst({
      where: { id: String(questionId), quizId: String(quizId) },
    });
    if (!question) return false;

    await getPrisma().quizChoice.deleteMany({
      where: { questionId: String(questionId) },
    });

    await getPrisma().quizQuestion.delete({ where: { id: question.id } });
    return true;
  } catch (err) {
    console.error(`[deleteQuestionFromQuiz] error:`, err.message);
    return false;
  }
}

/**
 * Update a question's text, answers, or correct choice.
 * @param {string} questionId
 * @param {object} updates - { text?, modelAnswer?, correctChoiceId?, choices? }
 * @returns {Promise<object|null>}
 */
async function updateQuestion(questionId, updates) {
  try {
    const question = await getPrisma().quizQuestion.findUnique({
      where: { id: String(questionId) },
      include: { choices: true },
    });

    if (!question) return null;

    // Update question text and model answer
    const updated = await getPrisma().quizQuestion.update({
      where: { id: String(questionId) },
      data: {
        text: updates.text ?? question.text,
        modelAnswer: updates.modelAnswer ?? question.modelAnswer,
        correctChoiceId: updates.correctChoiceId ?? question.correctChoiceId,
      },
      include: { choices: true },
    });

    if (Array.isArray(updates.choices) && question.type === "mcq") {
      for (let i = 0; i < updates.choices.length; i++) {
        const choice = question.choices[i];
        const text = String(updates.choices[i] ?? "").trim();
        if (choice && text) {
          await getPrisma().quizChoice.update({
            where: { id: choice.id },
            data: { text },
          });
        }
      }

      return await getPrisma().quizQuestion.findUnique({
        where: { id: String(questionId) },
        include: { choices: true },
      });
    }

    return updated;
  } catch (err) {
    console.error(`[updateQuestion] error:`, err.message);
    return null;
  }
}

/**
 * Persists an EDITED set of quiz SETTINGS (title, lesson, window, duration,
 * declared question count). Validation + ownership + the before-start gate
 * live in the route; this is the thin persistence layer. All `data` fields
 * are pre-validated by the caller.
 * @param {string} quizId
 * @param {object} data - Prisma-ready subset of quiz columns
 * @returns {Promise<object|null>} mapped quiz, or null when not found
 */
async function updateQuizMeta(quizId, data) {
  try {
    const updatedRow = await getPrisma().quiz.update({
      where: { id: String(quizId) },
      data,
    });
    return mapQuiz(updatedRow);
  } catch (err) {
    console.error(`[updateQuizMeta] error:`, err.message);
    return null;
  }
}

const service = {
  createQuiz,
  getQuizById,
  getQuizzesForLesson,
  getMixedQuizzesForLesson,
  getQuizzesForCourse,
  listAllQuizzes,
  addQuestionToQuiz,
  getQuestionsForQuiz,
  getQuizLessons,
  getQuizLessonsBatch,
  createAttempt,
  getAttemptsForStudent,
  listAttemptsForStudent,
  getAttemptById,
  setAttemptOrdering,
  saveInProgressAnswer,
  finalizeAttempt,
  countSubmittedAttempts,
  getAllowedAttemptCount,
  getAllowedAttemptCounts,
  grantAdditionalAttempt,
  getAllAttemptsForQuiz,
  getSubmittedResultsForQuiz,
  getStudentNameById,
  getStudentNamesByIds,
  getStudentIdsForCourse,
  getTeacherQuizzes,
  getTeacherQuiz,
  deleteQuiz,
  deleteQuestionFromQuiz,
  updateQuestion,
  updateQuizMeta,
};

// Every DB-backed function gains cold-start resilience transparently;
// the two TEST-ONLY overlay setters stay plain synchronous helpers.
module.exports = Object.fromEntries(
  Object.entries(service).map(([name, fn]) => [
    name,
    (...args) => withColdStartRetry(() => fn(...args)),
  ])
);
module.exports.setStudentNameForTesting = setStudentNameForTesting;
module.exports.setCourseRosterForTesting = setCourseRosterForTesting;
