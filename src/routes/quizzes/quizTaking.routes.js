/**
 * quizTaking.routes.js
 * ---------------------------------------------------------------------------
 * STUDENT flow for taking a quiz. Every route here is requireAuth+student.
 *
 *   POST /api/quizzes/:quizId/start      start OR auto-resume an attempt
 *   GET  /api/quizzes/:quizId/attempt    current attempt state (re-entry check)
 *   POST /api/quizzes/:quizId/answers    save ONE answer as it is changed
 *   POST /api/quizzes/:quizId/submit     submit (manual or already-expired)
 *
 * TIMING CONTRACT (all server-side, client values never trusted):
 *   personal cutoff = attempt.startedAt + quiz.durationMinutes
 *   effective cutoff = min(personal cutoff, quiz.endTime)
 * Whichever comes first wins; when the deadline passes with no manual
 * submit we grade whatever answers were saved so far ("auto-submit").
 *
 * RESUME CONTRACT: answers are saved on EVERY change (answers endpoint), so
 * a student who closed the tab reopens to find the same questions, their
 * saved answers pre-filled, and a countdown reduced by the time away â€” not
 * reset. Resume requires time remaining AND the window still open; otherwise
 * the saved attempt is finalized (auto-submitted) instead.
 */

const express = require("express");

const { requireAuth } = require("../../middleware/auth.middleware.js");
const { requireStudent } = require("./quiz.helpers.js");
const {
  remainingSeconds,
  expiryReason,
  isWithinQuizWindow,
  sanitizeQuestionForStudent,
  attachImageUrls,
  generateAttemptOrdering,
  applyAttemptOrdering,
} = require("./quiz.helpers.js");
const { gradeSubmission } = require("../../services/quizGrading.service.js");
const {
  getQuizById,
  getQuestionsForQuiz,
  listAllQuizzes,
  createAttempt,
  getAttemptsForStudent,
  saveInProgressAnswer,
  finalizeAttempt,
  countSubmittedAttempts,
  getAllowedAttemptCount,
} = require("../../services/quiz.stub.service.js");
const {
  isStudentEnrolledInLessonCourse,
} = require("../../services/enrollment.stub.service.js");

const router = express.Router();

// Per-route gates (see quizCreation.routes.js for why NOT router.use).

/* ------------------------------------------------------------------ *
 * Shared internal helpers
 * ------------------------------------------------------------------ */

/**
 * Loads the quiz or sends a 404 and returns null.
 * Small helper because every endpoint starts the same way.
 */
async function loadQuizOr404(request, response) {
  const quiz = await getQuizById(request.params.quizId);
  if (!quiz) {
    response.status(404).json({ error: "Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯." });
    return null;
  }
  return quiz;
}

/** The student's latest in-progress attempt, or null. */
async function findInProgressAttempt(quizId, studentId) {
  const attempts = await getAttemptsForStudent(quizId, studentId);
  return (
    attempts.find((attempt) => attempt.status === "in_progress") || null
  );
}

/**
 * Compact summary of a finished attempt â€” this is ALL a student may know
 * right after submission: MCQ score only, zero per-question detail (that is
 * gated behind the post-end_time review endpoint).
 */
function submittedSummary(attempt) {
  return {
    resultId: attempt.id,
    status: "submitted",
    attemptNumber: attempt.attemptNumber,
    score: attempt.score,
    totalMcq: attempt.totalMcq,
    submittedAt: attempt.submittedAt,
    submissionReason: attempt.submissionReason,
  };
}

/**
 * Auto-submits an expired in-progress attempt using its SAVED answers.
 * This one function powers all three expiry paths:
 *   - personal countdown hit zero (even while the student was solving)
 *   - quiz end_time arrived (cuts off even with personal time left)
 *   - student came back after either already happened while away
 *
 * @param {object} attempt  - The in-progress attempt.
 * @param {object} quiz     - The quiz.
 * @returns {Promise<object>} The finalized attempt.
 */
async function autoSubmitExpiredAttempt(attempt, quiz) {
  const questions = await getQuestionsForQuiz(quiz.id);
  const { score, totalMcq } = gradeSubmission(questions, attempt.answers);

  // submittedAt is pinned to WHEN THE LIMIT HIT, not when we happened to
  // notice â€” important for teacher records and auditability.
  const cutoff = Math.min(
    Date.parse(attempt.personalDeadline),
    Date.parse(quiz.endTime)
  );

  return finalizeAttempt(attempt.id, {
    score,
    totalMcq,
    reason: expiryReason(attempt, quiz),
    submittedAt: new Date(cutoff).toISOString(),
  });
}

/* ------------------------------------------------------------------ *
 * GET /quizzes/available - Exams Hub feed for the STUDENT.
 * Returns every quiz the student can see with its lesson, timing and a
 * FRESH server-computed status (upcoming | active | ended). Defined in
 * this router and mounted BEFORE the creation router so the literal path
 * is never captured by GET /quizzes/:quizId (which is teacher-only).
 *
 * FUTURE DB: quizzes joined to the enrollments table so only quizzes of
 * enrolled courses are returned; today the enrollment stub passes.
 * ------------------------------------------------------------------ */
router.get("/quizzes/available", requireAuth, requireStudent, async (req, res) => {
  const quizzes = await listAllQuizzes();
  const now = Date.now();

  const exams = quizzes.map((quiz) => {
    const startMs = Date.parse(quiz.startTime);
    const endMs = Date.parse(quiz.endTime);
    return {
      id: quiz.id,
      title: quiz.title,
      lessonId: quiz.lessonId,
      courseId: quiz.courseId,
      questionCount: quiz.questionCount,
      startTime: quiz.startTime,
      endTime: quiz.endTime,
      durationMinutes: quiz.durationMinutes,
      // Status computed FRESH on every request from the server clock.
      status:
        now < startMs ? "upcoming" : now <= endMs ? "active" : "ended",
    };
  });

  return res.json({ exams });
});

/* ------------------------------------------------------------------ *
 * POST /quizzes/:quizId/start - start fresh OR resume automatically
 * ------------------------------------------------------------------ */
router.post("/quizzes/:quizId/start", requireAuth, requireStudent, async (req, res) => {
  const quiz = await loadQuizOr404(req, res);
  if (!quiz) return;

  // (a) Enrollment â€” reuses the SAME stub as videos/materials features.
  const enrolled = await isStudentEnrolledInLessonCourse(
    req.user.id,
    quiz.lessonId
  );
  if (!enrolled) {
    return res.status(403).json({
      error: "ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ†ÙŠ Ù…Ø³Ø¬Ù„Ø© ÙÙŠ Ø§Ù„ÙƒÙˆØ±Ø³ Ø§Ù„Ø®Ø§Øµ Ø¨Ù‡Ø°Ø§ Ø§Ù„Ø¯Ø±Ø³.",
    });
  }

  // (b) Window check.
  if (Date.now() < Date.parse(quiz.startTime)) {
    return res.status(403).json({
      error: "Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Ù„Ù… ÙŠØ¨Ø¯Ø£ Ø¨Ø¹Ø¯.",
      startTime: quiz.startTime,
    });
  }

  const questions = await getQuestionsForQuiz(quiz.id);
  if (questions.length === 0) {
    return res.status(400).json({ error: "Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Ù„Ø§ ÙŠØ­ØªÙˆÙŠ Ø£Ø³Ø¦Ù„Ø© Ø¨Ø¹Ø¯." });
  }
  await attachImageUrls(questions);

  /* ---- RESUME PATH: an unfinished attempt exists ------------------- */
  const inProgress = await findInProgressAttempt(quiz.id, req.user.id);
  if (inProgress) {
    if (remainingSeconds(inProgress, quiz) <= 0 || !isWithinQuizWindow(quiz)) {
      // Time ran out while they were away -> treat like any other
      // auto-submit; do NOT let them keep solving.
      const finalized = await autoSubmitExpiredAttempt(inProgress, quiz);
      return res.json({
        status: "auto_submitted",
        message:
          "Ø§Ù†ØªÙ‡Ù‰ ÙˆÙ‚Øª Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Ù‚Ø¨Ù„ Ø¹ÙˆØ¯ØªÙƒØŒ ÙˆØªÙ… ØªØ³Ù„ÙŠÙ… Ø¥Ø¬Ø§Ø¬Ø§ØªÙƒ Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø© ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹.",
        result: submittedSummary(finalized),
      });
    }

    // Still has time -> hand back the same questions + saved answers +
    // REDUCED remaining seconds computed from the stored start timestamp.
    return res.json({
      status: "resumed",
      attemptId: inProgress.id,
      startedAt: inProgress.startedAt,
      personalDeadline: inProgress.personalDeadline,
      endTime: quiz.endTime,
      remainingSeconds: remainingSeconds(inProgress, quiz),
      durationMinutes: quiz.durationMinutes,
      // SAME persisted shuffle as the original start - never re-shuffled.
      questions: applyAttemptOrdering(questions, inProgress.ordering).map(
        sanitizeQuestionForStudent
      ),
      savedAnswers: Object.fromEntries(
        Object.entries(inProgress.answers).map(([questionId, entry]) => [
          questionId,
          entry.value,
        ])
      ),
    });
  }

  /* ---- NEW ATTEMPT PATH -------------------------------------------- */
  // (c) One-attempt rule: submitted attempts must fit under the allowance
  // (1 by default, more only via teacher grant-retry).
  const used = await countSubmittedAttempts(quiz.id, req.user.id);
  const allowed = await getAllowedAttemptCount(quiz.id, req.user.id);
  if (used >= allowed) {
    return res.status(403).json({
      error: allowed > 1
        ? "Ù„Ù‚Ø¯ Ø§Ø³ØªØ®Ø¯Ù…ØªÙ ÙƒÙ„ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø§Øª Ø§Ù„Ù…ØªØ§Ø­Ø© Ù„Ùƒ ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±."
        : "Ù„Ù‚Ø¯ Ø§Ø³ØªØ®Ø¯Ù…ØªÙ Ù…Ø­Ø§ÙˆÙ„ØªÙƒ Ø§Ù„ÙˆØ­ÙŠØ¯Ø© ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±.",
    });
  }

  if (Date.now() > Date.parse(quiz.endTime)) {
    return res.status(403).json({ error: "Ø§Ù†ØªÙ‡Ù‰ ÙˆÙ‚Øª Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±." });
  }

  // Personal cutoff recorded SERVER-SIDE at the moment of start.
  const personalDeadline = new Date(
    Date.now() + quiz.durationMinutes * 60 * 1000
  ).toISOString();
  const attempt = await createAttempt(quiz.id, req.user.id, personalDeadline);

  // Per-attempt shuffle generated SERVER-SIDE and stored on the attempt so
  // resume replays the exact same order (grading matches by choice ID, so
  // shuffling can never affect correctness).
  attempt.ordering = generateAttemptOrdering(questions);

  return res.status(201).json({
    status: "started",
    attemptId: attempt.id,
    startedAt: attempt.startedAt,
    personalDeadline: attempt.personalDeadline,
    endTime: quiz.endTime,
    remainingSeconds: remainingSeconds(attempt, quiz),
    durationMinutes: quiz.durationMinutes,
    questions: applyAttemptOrdering(questions, attempt.ordering).map(
      sanitizeQuestionForStudent
    ),
    savedAnswers: {},
  });
});

/* ------------------------------------------------------------------ *
 * GET /quizzes/:quizId/attempt â€” cheap state probe for re-entry UIs.
 * Also finalizes lazily when the deadline passed while nobody called us.
 * ------------------------------------------------------------------ */
router.get("/quizzes/:quizId/attempt", requireAuth, requireStudent, async (req, res) => {
  const quiz = await loadQuizOr404(req, res);
  if (!quiz) return;

  const attempts = await getAttemptsForStudent(quiz.id, req.user.id);
  const inProgress = attempts.find((a) => a.status === "in_progress");

  if (inProgress && remainingSeconds(inProgress, quiz) <= 0) {
    const finalized = await autoSubmitExpiredAttempt(inProgress, quiz);
    return res.json({
      status: "submitted",
      result: submittedSummary(finalized),
    });
  }

  if (inProgress) {
    return res.json({
      status: "in_progress",
      attemptId: inProgress.id,
      remainingSeconds: remainingSeconds(inProgress, quiz),
      personalDeadline: inProgress.personalDeadline,
      endTime: quiz.endTime,
    });
  }

  const lastSubmitted = [...attempts]
    .filter((a) => a.status === "submitted")
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
    [0];

  if (lastSubmitted) {
    return res.json({
      status: "submitted",
      result: submittedSummary(lastSubmitted),
      canRetry: false,
    });
  }

  return res.json({ status: "not_started" });
});

/* ------------------------------------------------------------------ *
 * POST /quizzes/:quizId/answers â€” incremental autosave (one answer)
 * Body: { questionId, value }  value = choice id | written text
 * ------------------------------------------------------------------ */
router.post("/quizzes/:quizId/answers", requireAuth, requireStudent, async (req, res) => {
  const quiz = await loadQuizOr404(req, res);
  if (!quiz) return;

  const inProgress = await findInProgressAttempt(quiz.id, req.user.id);
  if (!inProgress) {
    return res.status(409).json({ error: "Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø­Ø§ÙˆÙ„Ø© Ø¬Ø§Ø±ÙŠØ©." });
  }

  // Deadline enforcement: once time is up we stop accepting changes and
  // flip the attempt to submitted immediately (lazy auto-submit).
  if (remainingSeconds(inProgress, quiz) <= 0) {
    const finalized = await autoSubmitExpiredAttempt(inProgress, quiz);
    return res.status(409).json({
      error: "Ø§Ù†ØªÙ‡Ù‰ Ø§Ù„ÙˆÙ‚Øª ÙˆØªÙ… ØªØ³Ù„ÙŠÙ… Ø¥Ø¬Ø§Ø¨Ø§ØªÙƒ Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©.",
      result: submittedSummary(finalized),
    });
  }

  const questionId = String((req.body && req.body.questionId) || "");
  const value = String((req.body && req.body.value) ?? "");

  const questions = await getQuestionsForQuiz(quiz.id);
  if (!questions.some((question) => question.id === questionId)) {
    return res.status(400).json({ error: "Ø³Ø¤Ø§Ù„ ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ." });
  }

  const saved = await saveInProgressAnswer(inProgress.id, questionId, value);
  if (!saved) {
    return res.status(409).json({ error: "Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø­ÙØ¸ Ø§Ù„Ø¥Ø¬Ø§Ø¨Ø© Ø§Ù„Ø¢Ù†." });
  }

  return res.json({ message: "ØªÙ… Ø§Ù„Ø­ÙØ¸.", questionId });
});

/* ------------------------------------------------------------------ *
 * POST /quizzes/:quizId/submit â€” finish the quiz
 * Optional body: { answers: { questionId: value } } final flush.
 * ------------------------------------------------------------------ */
router.post("/quizzes/:quizId/submit", requireAuth, requireStudent, async (req, res) => {
  const quiz = await loadQuizOr404(req, res);
  if (!quiz) return;

  const inProgress = await findInProgressAttempt(quiz.id, req.user.id);
  if (!inProgress) {
    return res
      .status(409)
      .json({ error: "Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø­Ø§ÙˆÙ„Ø© Ø¬Ø§Ø±ÙŠØ© Ù„ØªØ³Ù„ÙŠÙ…Ù‡Ø§." });
  }

  const expired = remainingSeconds(inProgress, quiz) <= 0;
  let answersMap = { ...inProgress.answers };

  if (!expired && req.body && req.body.answers) {
    // Final flush of any answers changed since the last autosave.
    // Only accepted BEFORE the deadline â€” late payloads are ignored and we
    // grade what the server had saved up to the cutoff.
    for (const [questionId, value] of Object.entries(req.body.answers)) {
      answersMap[questionId] = { value: String(value == null ? "" : value) };
    }
  }

  const reason = expired ? expiryReason(inProgress, quiz) : "manual";
  const questions = await getQuestionsForQuiz(quiz.id);
  const { score, totalMcq } = gradeSubmission(questions, answersMap);

  const finalized = await finalizeAttempt(inProgress.id, {
    score,
    totalMcq,
    reason,
    submittedAt: expired
      ? new Date(Math.min(Date.parse(inProgress.personalDeadline), Date.parse(quiz.endTime))).toISOString()
      : new Date().toISOString(),
  });

  return res.json({
    message:
      reason === "manual"
        ? "ØªÙ… ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±."
        : "Ø§Ù†ØªÙ‡Ù‰ Ø§Ù„ÙˆÙ‚Øª ÙˆØªÙ… Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ.",
    result: submittedSummary(finalized || inProgress),
  });
});

module.exports = router;
