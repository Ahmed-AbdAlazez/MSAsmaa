/**
 * quiz.stub.service.js
 * ===========================================================================
 * ⚠️⚠️⚠️  REPLACE THIS STUB — DO NOT SHIP TO PRODUCTION  ⚠️⚠️⚠️
 * ===========================================================================
 *
 * TEMPORARY stand-ins for every database read/write the QUIZ feature needs.
 * Everything lives in plain in-memory Maps, exactly like the video/material
 * stubs this project already uses. QUIZ_README.md contains the full
 * "stub function -> future Prisma table/columns" mapping table.
 *
 * WHAT IS FAKE RIGHT NOW:
 *   quizzesById           quiz metadata (title, times, duration...)
 *   questionsByQuizId     questions incl. correct answers (NEVER send those
 *                         to students while taking — see helpers file)
 *   attemptsByQuizAndStudent  ONE ENTRY PER ATTEMPT (in-progress OR submitted).
 *                         In-progress attempts keep partially-saved answers so
 *                         a student can resume after closing the tab.
 *   extraAttemptsByKey    how many ADDITIONAL attempts a teacher granted.
 *   studentNamesById      fake display names (real version reads users table)
 *   courseRosterByCourseId  fake "students enrolled in course" roster.
 *
 * HOW TO REPLACE IT (this file only):
 *   Rewrite each function body as Prisma calls. Keep NAMES, parameters and
 *   return contracts identical — every route imports from THIS file, so no
 *   route changes are needed when the real database lands.
 *
 * WHAT BREAKS IF YOU NEVER REPLACE IT:
 *   - Server restart / serverless freeze wipes ALL quizzes, answers, scores.
 *   - Two server instances would disagree about who already attempted what.
 * ===========================================================================
 */

const crypto = require("crypto");

/* ------------------------------------------------------------------ *
 * IN-MEMORY STORAGE
 * ------------------------------------------------------------------ */

/** quizId -> quiz record (metadata only; questions live separately). */
const quizzesById = new Map();

/** quizId -> array of question records, in teacher-added order. */
const questionsByQuizId = new Map();

/** `${quizId}:${studentId}` -> array of attempts ordered by attemptNumber.
 *  An attempt is EITHER 'in_progress' OR 'submitted' — never both. */
const attemptsByQuizAndStudent = new Map();

/** resultId (== attempt id) -> attempt record, for direct lookups by ID. */
const attemptsById = new Map();

/** `${quizId}:${studentId}` -> number of EXTRA granted attempts (default 0). */
const extraAttemptsByKey = new Map();

/** studentId -> display name (stub only; real version joins users table). */
const studentNamesById = new Map();

/** courseId -> array of enrolled studentIds (roster for leaderboards). */
const courseRosterByCourseId = new Map();

/** Generates a unique ID (quizzes, questions, attempts). */
function newId() {
  return crypto.randomUUID();
}

/* ------------------------------------------------------------------ *
 * QUIZZES
 * ------------------------------------------------------------------ */

/**
 * Creates and stores a quiz attached to a lesson.
 *
 * FUTURE DB: INSERT INTO quizzes (...) — columns per the object below.
 * `courseId` is optional because there is no real lessons/courses table yet;
 * with a real schema derive it from lesson -> unit -> course server-side,
 * never from the client.
 *
 * @param {object} input - { lessonId, courseId?, title, questionCount,
 *                          startTime, endTime, durationMinutes }
 * @returns {Promise<object>} The stored quiz record.
 */
async function createQuiz(input) {
  const quiz = {
    id: newId(),
    lessonId: String(input.lessonId),
    courseId: input.courseId ? String(input.courseId) : null,
    title: String(input.title).trim(),
    // How many questions the teacher DECLARED. Adding more than this is
    // rejected so the declared number stays meaningful to students.
    questionCount: Number(input.questionCount),
    // ISO strings — compared with Date.parse everywhere else.
    startTime: new Date(input.startTime).toISOString(),
    endTime: new Date(input.endTime).toISOString(),
    // Per-student countdown length in minutes (fractional allowed for tests).
    durationMinutes: Number(input.durationMinutes),
    createdAt: new Date().toISOString(),
  };

  quizzesById.set(quiz.id, quiz);
  questionsByQuizId.set(quiz.id, []);
  return quiz;
}

/**
 * Lists every quiz in storage (Exams Hub feed source).
 *
 * FUTURE DB: prisma.quiz.findMany({ orderBy: { startTime: "asc" } }) joined
 * to enrollments so students only see quizzes of their courses.
 *
 * @returns {Promise<object[]>} All quizzes, soonest-starting first.
 */
async function listAllQuizzes() {
  return [...quizzesById.values()].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );
}

/**
 * Reads one quiz by ID.
 *
 * @param {string} quizId - The quiz to find.
 * @returns {Promise<object|null>} The quiz record, or null when missing.
 */
async function getQuizById(quizId) {
  return quizzesById.get(String(quizId)) || null;
}

/**
 * Lists all quizzes attached to one lesson (for the lesson page).
 *
 * @param {string} lessonId - The lesson whose quizzes should be listed.
 * @returns {Promise<object[]>} Quiz records, newest first.
 */
async function getQuizzesForLesson(lessonId) {
  return [...quizzesById.values()]
    .filter((quiz) => quiz.lessonId === String(lessonId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Lists all quizzes belonging to one course (source for course leaderboard).
 *
 * FUTURE DB: SELECT quizzes JOIN lessons ... WHERE course = :courseId.
 *
 * @param {string} courseId - The course identifier.
 * @returns {Promise<object[]>} Quizzes in the course.
 */
async function getQuizzesForCourse(courseId) {
  return [...quizzesById.values()].filter(
    (quiz) => quiz.courseId === String(courseId)
  );
}

/* ------------------------------------------------------------------ *
 * QUESTIONS
 * ------------------------------------------------------------------ */

/**
 * Adds one question to a quiz.
 *
 * The calling route already validated the shape; this function enforces the
 * STORAGE rules: quiz must exist, must not exceed its declared question
 * count, and MCQ choices are normalized into stable choice objects
 * ({id, text}) so submitted answers can be compared BY ID, not by text.
 *
 * FUTURE DB: INSERT INTO questions (+ child rows for mcq_choices).
 *
 * @param {string} quizId - The quiz this question belongs to.
 * @param {object} input  - Validated question fields (see creation routes).
 * @returns {Promise<object>} The stored question record.
 */
async function addQuestionToQuiz(quizId, input) {
  const quiz = quizzesById.get(String(quizId));
  if (!quiz) throw new Error("QUIZ_NOT_FOUND");

  const existing = questionsByQuizId.get(quiz.id) || [];
  if (existing.length >= quiz.questionCount) {
    throw new Error("QUIZ_QUESTION_LIMIT_REACHED");
  }

  const question = {
    id: newId(),
    quizId: quiz.id,
    order: existing.length + 1,
    type: input.type, // "mcq" | "written"
    text: String(input.text).trim(),
  };

  if (input.type === "mcq") {
    question.choices = input.choices.map((text, index) => ({
      id: `c${index + 1}`,
      text: String(text).trim(),
    }));
    question.correctChoiceId = question.choices[input.correctIndex].id;
  } else {
    // Written questions keep the model answer purely for LATER DISPLAY.
    // It is never graded, never compared, never scored — anywhere.
    question.modelAnswer = String(input.modelAnswer).trim();
  }

  // Optional image: ONLY the storage path is persisted, never the bytes.
  question.imagePath = input.imagePath ? String(input.imagePath) : null;

  existing.push(question);
  questionsByQuizId.set(quiz.id, existing);
  return question;
}

/**
 * Returns ALL questions of a quiz WITH correct answers / model answers.
 *
 * ⚠️ CALLER RESPONSIBILITY: this is the FULL version. Student-facing routes
 * must pass results through sanitizeQuestionForStudent() (quiz.helpers.js)
 * before responding. Only the teacher view and the post-deadline review may
 * ever see correctChoiceId / modelAnswer.
 *
 * @param {string} quizId - The quiz whose questions to read.
 * @returns {Promise<object[]>} Full question records in order.
 */
async function getQuestionsForQuiz(quizId) {
  return [...(questionsByQuizId.get(String(quizId)) || [])].sort(
    (a, b) => a.order - b.order
  );
}

/* ------------------------------------------------------------------ *
 * ATTEMPTS (one row per attempt; supports resume + granted retries)
 * ------------------------------------------------------------------ */

/** Composite key grouping one student's attempts for one quiz. */
function attemptKey(quizId, studentId) {
  return `${quizId}:${studentId}`;
}

/**
 * Creates a NEW in-progress attempt. The server records the exact start
 * time AND the personal cutoff (startedAt + durationMinutes) — both are
 * computed HERE ON THE SERVER and never trusted from the client.
 *
 * FUTURE DB: INSERT INTO quiz_attempts (status='in_progress',
 *            started_at=now, personal_deadline=:personalDeadline).
 *
 * @param {string} quizId           - The quiz being taken.
 * @param {string} studentId        - The student taking it.
 * @param {string} personalDeadline - ISO instant when their countdown ends.
 * @returns {Promise<object>} The fresh attempt record.
 */
async function createAttempt(quizId, studentId, personalDeadline) {
  const key = attemptKey(quizId, studentId);
  const previous = attemptsByQuizAndStudent.get(key) || [];

  const attempt = {
    id: newId(), // doubles as the "result id" used by the review endpoint
    quizId: String(quizId),
    studentId: String(studentId),
    attemptNumber: previous.length + 1,
    status: "in_progress",
    startedAt: new Date().toISOString(),
    // Personal cutoff = startedAt + durationMinutes. Stored here at start;
    // routes still take min(personalDeadline, quiz.endTime) when checking,
    // so a teacher shortening end_time mid-quiz keeps cutting people off.
    personalDeadline: new Date(personalDeadline).toISOString(),
    submittedAt: null,
    submissionReason: null, // 'manual' | 'auto-personal-timer' | 'auto-quiz-end'
    score: null,            // MCQ-only score (written answers are NEVER scored)
    totalMcq: null,         // number of MCQ questions when graded
    // questionId -> { value, updatedAt }. Saved AS the student types/selects
    // so an interrupted session resumes with answers intact.
    answers: {},
  };

  previous.push(attempt);
  attemptsByQuizAndStudent.set(key, previous);
  attemptsById.set(attempt.id, attempt);
  return attempt;
}

/**
 * Returns all attempts (any status) one student has for one quiz.
 *
 * @param {string} quizId    - The quiz.
 * @param {string} studentId - The student.
 * @returns {Promise<object[]>} Attempts ordered oldest first.
 */
async function getAttemptsForStudent(quizId, studentId) {
  return [...(attemptsByQuizAndStudent.get(attemptKey(quizId, studentId)) || [])];
}

/**
 * Finds one attempt by its ID (the "result id" from the review endpoint).
 *
 * @param {string} resultId - Attempt/result ID.
 * @returns {Promise<object|null>} The attempt, or null when missing.
 */
async function getAttemptById(resultId) {
  return attemptsById.get(String(resultId)) || null;
}

/**
 * Saves ONE answer for an IN-PROGRESS attempt (called on every change the
 * student makes, not only on submit). This is what makes resume work: when
 * the student reopens the quiz they see these values pre-filled.
 *
 * Silently ignores writes after the attempt is submitted — a late autosave
 * from a closing tab must never mutate a graded result.
 *
 * FUTURE DB: UPSERT INTO quiz_answers (attempt_id, question_id, value).
 *
 * @param {string} attemptId  - The in-progress attempt.
 * @param {string} questionId - The question being answered.
 * @param {string} value      - Choice ID (mcq) or free text (written).
 * @returns {Promise<boolean>} true if saved, false if attempt not in-progress.
 */
async function saveInProgressAnswer(attemptId, questionId, value) {
  const attempt = attemptsById.get(String(attemptId));
  if (!attempt || attempt.status !== "in_progress") return false;

  attempt.answers[String(questionId)] = {
    value: String(value == null ? "" : value),
    updatedAt: new Date().toISOString(),
  };
  return true;
}

/**
 * Marks an attempt as submitted and stores its final graded outcome.
 * Used by manual submits AND by auto-submits (personal timer / quiz end),
 * including the "student came back too late" path.
 *
 * FUTURE DB: UPDATE quiz_attempts SET status='submitted', score=... ,
 *            submitted_at=..., submission_reason=...
 *
 * @param {string} attemptId - The attempt to finalize.
 * @param {object} result    - { score, totalMcq, reason, submittedAt }
 * @returns {Promise<object|null>} The updated attempt, or null.
 */
async function finalizeAttempt(attemptId, result) {
  const attempt = attemptsById.get(String(attemptId));
  if (!attempt || attempt.status === "submitted") return null;

  attempt.status = "submitted";
  attempt.score = Number(result.score);
  attempt.totalMcq = Number(result.totalMcq);
  attempt.submissionReason = String(result.reason);
  attempt.submittedAt = new Date(result.submittedAt || Date.now()).toISOString();
  return attempt;
}

/**
 * Counts how many SUBMITTED attempts a student has used on a quiz.
 * In-progress attempts do NOT count against the allowance until submitted
 * (an abandoned one gets finalized by the expiry logic instead).
 *
 * @param {string} quizId    - The quiz.
 * @param {string} studentId - The student.
 * @returns {Promise<number>} Used attempts so far.
 */
async function countSubmittedAttempts(quizId, studentId) {
  const all = await getAttemptsForStudent(quizId, studentId);
  return all.filter((attempt) => attempt.status === "submitted").length;
}

/**
 * Total attempts this student may use (1 by default + teacher-granted extra).
 *
 * FUTURE DB: column/row on an attempts_allowance or quiz_assignments table.
 *
 * @param {string} quizId    - The quiz.
 * @param {string} studentId - The student.
 * @returns {Promise<number>} Allowed attempt count.
 */
async function getAllowedAttemptCount(quizId, studentId) {
  return 1 + (extraAttemptsByKey.get(attemptKey(quizId, studentId)) || 0);
}

/**
 * Teacher grants ONE additional attempt to a specific student for a quiz.
 * Calling it twice grants two. Existing results are kept untouched.
 *
 * @param {string} quizId    - The quiz.
 * @param {string} studentId - The student receiving another try.
 * @returns {Promise<number>} The new total allowance.
 */
async function grantAdditionalAttempt(quizId, studentId) {
  const key = attemptKey(quizId, studentId);
  const next = (extraAttemptsByKey.get(key) || 0) + 1;
  extraAttemptsByKey.set(key, next);
  return 1 + next;
}

/* ------------------------------------------------------------------ *
 * RESULTS & ROSTERS (leaderboard inputs)
 * ------------------------------------------------------------------ */

/**
 * ALL attempts for a quiz regardless of status or student — lets the teacher
 * see who currently has an attempt open (in-progress) as well as results.
 *
 * FUTURE DB: SELECT ... FROM quiz_attempts WHERE quiz_id = :quizId.
 *
 * @param {string} quizId - The quiz.
 * @returns {Promise<object[]>} Every attempt row for this quiz.
 */
async function getAllAttemptsForQuiz(quizId) {
  const rows = [];
  for (const attempts of attemptsByQuizAndStudent.values()) {
    for (const attempt of attempts) {
      if (attempt.quizId === String(quizId)) rows.push(attempt);
    }
  }
  return rows;
}

/**
 * All SUBMITTED results across every student for one quiz — the raw input
 * for leaderboards and for the teacher's per-quiz results view.
 *
 * FUTURE DB: SELECT ... FROM quiz_attempts WHERE quiz_id=:id AND
 *            status='submitted'.
 *
 * @param {string} quizId - The quiz.
 * @returns {Promise<object[]>} Submitted attempts (any student).
 */
async function getSubmittedResultsForQuiz(quizId) {
  return (await getAllAttemptsForQuiz(quizId)).filter(
    (attempt) => attempt.status === "submitted"
  );
}

/**
 * Display name for a student id. Real version: users table lookup.
 *
 * @param {string} studentId - The user id from the JWT.
 * @returns {Promise<string>} A display name, or "طالب" fallback.
 */
async function getStudentNameById(studentId) {
  // TODO(REPLACE-STUB): prisma.user.findUnique({ where: { id } }).name
  return studentNamesById.get(String(studentId)) || `طالب ${String(studentId).slice(0, 6)}`;
}

/**
 * TEST-ONLY helper: seeds a fake display name without touching auth.
 * Remove when the real users table is connected.
 */
function setStudentNameForTesting(studentId, name) {
  studentNamesById.set(String(studentId), String(name));
}

/**
 * Roster: every student enrolled in a course. Used ONLY to add
 * "never attempted" students to leaderboards with a zero score.
 *
 * STUB BEHAVIOUR: returns whatever the test/dev seeded.
 * FUTURE DB: SELECT studentId FROM enrollments WHERE course = :courseId
 *            (same table isStudentEnrolledInLessonCourse will query — that
 *             existing stub stays the single source for ACCESS checks; this
 *             function is only for LISTING the roster).
 *
 * @param {string} courseId - The course identifier.
 * @returns {Promise<string[]>} Enrolled student ids.
 */
async function getStudentIdsForCourse(courseId) {
  return [...(courseRosterByCourseId.get(String(courseId)) || [])];
}

/**
 * TEST-ONLY helper: seeds the fake course roster. Remove with real DB.
 */
function setCourseRosterForTesting(courseId, studentIds) {
  courseRosterByCourseId.set(String(courseId), [...studentIds]);
}

module.exports = {
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
  saveInProgressAnswer,
  finalizeAttempt,
  countSubmittedAttempts,
  getAllowedAttemptCount,
  grantAdditionalAttempt,
  getAllAttemptsForQuiz,
  getSubmittedResultsForQuiz,
  getStudentNameById,
  setStudentNameForTesting,
  getStudentIdsForCourse,
  setCourseRosterForTesting,
};
