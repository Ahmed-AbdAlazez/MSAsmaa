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

const { PrismaClient } = require("@prisma/client");

/* ------------------------------------------------------------------ *
 * PRISMA CLIENT (lazy)
 * Some entry points require this service before ANY dotenv.run() has
 * populated process.env (script require-order quirks). Building the
 * client lazily on first QUERY guarantees the environment is settled,
 * and we fall back to reading .env ourselves if nobody else did.
 * Neon serverless can also refuse connections right after a cold
 * start -> generous connect timeout + one transparent retry below.
 * ------------------------------------------------------------------ */
let _client = null;

function buildClient() {
  let url = process.env.DATABASE_URL;
  console.error(
    "[svc][debug] buildClient sees:",
    url ? new URL(url).host : JSON.stringify(process.env.DATABASE_URL),
    "| dotenv-loaded:",
    Boolean(process.env.JWT_SECRET)
  );
  if (!url) {
    try {
      require("dotenv").config();
    } catch (_) {}
    url = process.env.DATABASE_URL;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connect_timeout")) {
      parsed.searchParams.set("connect_timeout", "15");
    }
    url = parsed.toString();
  } catch (_) {
    /* leave as-is; Prisma will surface a clear validation error */
  }
  return new PrismaClient({ datasources: { db: { url } } });
}

function getPrisma() {
  if (!_client) _client = buildClient();
  return _client;
}

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
        typeof error.code === "string" &&
        error.code.startsWith("P") &&
        RETRYABLE_FRAGMENTS.some((fragment) => message.includes(fragment));
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
    lessonId: row.lessonId,
    courseId: row.courseId,
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
 * Creates and stores a quiz attached to a lesson.
 * @param {object} input - { lessonId, courseId?, title, questionCount,
 *                          startTime, endTime, durationMinutes }
 * @returns {Promise<object>} The stored quiz record.
 */
async function createQuiz(input) {
  const row = await getPrisma().quiz.create({
    data: {
      lessonId: String(input.lessonId),
      courseId: input.courseId ? String(input.courseId) : null,
      title: String(input.title).trim(),
      questionCount: Number(input.questionCount),
      startTime: new Date(input.startTime),
      endTime: new Date(input.endTime),
      durationMinutes: Number(input.durationMinutes),
    },
  });
  return mapQuiz(row);
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
    orderBy: { startTime: "asc" },
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
 * Lists all quizzes of one lesson, newest first.
 * @param {string} lessonId
 * @returns {Promise<object[]>}
 */
async function getQuizzesForLesson(lessonId) {
  const rows = await getPrisma().quiz.findMany({
    where: { lessonId: String(lessonId) },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapQuiz);
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

const service = {
  createQuiz,
  getQuizById,
  getQuizzesForLesson,
  getQuizzesForCourse,
  listAllQuizzes,
  addQuestionToQuiz,
  getQuestionsForQuiz,
  createAttempt,
  getAttemptsForStudent,
  getAttemptById,
  setAttemptOrdering,
  saveInProgressAnswer,
  finalizeAttempt,
  countSubmittedAttempts,
  getAllowedAttemptCount,
  grantAdditionalAttempt,
  getAllAttemptsForQuiz,
  getSubmittedResultsForQuiz,
  getStudentNameById,
  getStudentIdsForCourse,
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
