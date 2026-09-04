/**
 * quizReview.routes.js
 * ---------------------------------------------------------------------------
 * POST-deadline answer review:
 *
 *   GET /api/quiz-results/:resultId/review
 *
 * GATING RULE (server-side, non-negotiable): full answers are returned ONLY
 * after the quiz's end_time has passed. A student hitting this endpoint
 * directly before end_time gets a clear "not yet available" response with NO
 * answer data — regardless of anything the UI shows or hides.
 *
 * Once released, the response gives the frontend exactly what it needs for
 * the required display rules:
 *   - MCQ: student's submitted choice + the correct choice, plus an explicit
 *     `wasCorrect` flag. Frontend colors: wrong -> their choice red AND the
 *     correct one green; right -> ONLY the correct one green (no red).
 *   - Written: student's text and the model answer side by side, with NO
 *     correct/incorrect flag of any kind — written questions are never graded.
 */

const express = require("express");

const { requireAuth } = require("../../middleware/auth.middleware.js");
const { attachImageUrls, isQuizReleased } = require("./quiz.helpers.js");
const {
  getAttemptById,
  getQuizById,
  getTeacherQuiz,
  getQuestionsForQuiz,
  getStudentNameById,
  listAttemptsForStudent,
} = require("../../services/quiz.stub.service.js");

const router = express.Router();

// Per-route gates (see quizCreation.routes.js for why NOT router.use).
// Any authenticated user may CALL the endpoint, but ownership is enforced
// inside: students can only ever open their own result.

/**
 * Build one post-release review question object from the canonical question
 * record and the student's submitted answer entry (if any). This single
 * builder powers BOTH the attempt-level review (existing UI) and the new
 * quiz-level review (for a student who has no submitted attempt):
 *
 *   - MCQ: student's chosen choice id + the correct choice id + an explicit
 *     `wasCorrect` flag and `answered` (false when the student gave no pick).
 *     Frontend colors: wrong -> student pick red AND correct green; right ->
 *     ONLY the correct green; unanswered -> "Not Answered" + correct answer.
 *   - Written: student's text and the model answer side by side, with NO
 *     correct/incorrect flag — written questions are never graded.
 *
 * @param {object} question - Full question record (has choices/correct/model).
 * @param {object|undefined} submittedAnswer - attempt.answers[question.id].
 * @returns {object} The sanitized review payload for the frontend.
 */
function buildReviewQuestion(question, submittedAnswer) {
  if (question.type === "mcq") {
    const chosenChoiceId = submittedAnswer ? submittedAnswer.value : null;
    const wasCorrect = chosenChoiceId === question.correctChoiceId;

    // Send BOTH choices as full objects so the frontend renders text and the
    // explicit flags it needs for red/green / "Not Answered" coloring.
    return {
      questionId: question.id,
      order: question.order,
      type: "mcq",
      text: question.text,
      imageUrl: question.signedImageUrl || null,
      choices: question.choices, // includes every choice with its id/text
      studentChoiceId: chosenChoiceId,
      correctChoiceId: question.correctChoiceId, // allowed: past end_time
      wasCorrect,
      answered: Boolean(chosenChoiceId),
    };
  }

  // Written: plain side-by-side data. NO wasCorrect / no correct boolean —
  // these questions are NEVER graded anywhere in the platform.
  return {
    questionId: question.id,
    order: question.order,
    type: "written",
    text: question.text,
    imageUrl: question.signedImageUrl || null,
    studentAnswer: submittedAnswer ? submittedAnswer.value : null,
    modelAnswer: question.modelAnswer, // teacher reference, display-only
  };
}

/**
 * GET /quiz-results/:resultId/review
 * The resultId is the attempt id returned at submit time.
 */
router.get("/quiz-results/:resultId/review", requireAuth, async (req, res) => {
  const attempt = await getAttemptById(req.params.resultId);
  if (!attempt) {
    return res.status(404).json({ error: "النتيجة غير موجودة." });
  }

  // Ownership: students may only review THEIR OWN attempt. Teachers can
  // review anyone's, but ONLY for quizzes they created (same rule as the
  // management routes).
  if (req.user.role !== "teacher" && attempt.studentId !== req.user.id) {
    return res.status(403).json({ error: "هذه نتيجة لطالب آخر." });
  }

  const quiz =
    req.user.role === "teacher"
      ? await getTeacherQuiz(attempt.quizId, req.user.id)
      : await getQuizById(attempt.quizId);
  if (!quiz) return res.status(404).json({ error: "الاختبار غير موجود." });

  /* ---- THE TIME GATE --------------------------------------------- */
  if (!attempt.submittedAt) {
    return res.status(409).json({
      error: "لم يتم تسليم هذا الاختبار بعد.",
    });
  }

  if (!isQuizReleased(quiz)) {
    // Rejected BEFORE release: no per-question data leaves the server.
    return res.status(403).json({
      error: "مراجعة الإجابات غير متاحة حالياً.",
      message: `ستظهر المراجعة بعد انتهاء وقت الاختبار للجميع.`,
      availableAfter: quiz.endTime,
      review: null,
    });
  }

  /* ---- RELEASED: build the full per-question view ------------------ */
  const questions = await getQuestionsForQuiz(quiz.id);
  await attachImageUrls(questions, req); // images render again inside the review

  const reviewQuestions = questions
    .map((question) =>
      buildReviewQuestion(question, attempt.answers[question.id]),
    )
    .sort((a, b) => a.order - b.order);

  return res.json({
    review: {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        endTime: quiz.endTime,
      },
      studentName:
        req.user.role === "teacher"
          ? await getStudentNameById(attempt.studentId)
          : undefined,
      attemptNumber: attempt.attemptNumber,
      score: attempt.score, // MCQ-based score (unchanged rule)
      totalMcq: attempt.totalMcq, // denominator = MCQ count only
      submittedAt: attempt.submittedAt,
      submissionReason: attempt.submissionReason,
      releasedAt: quiz.endTime,
      questions: reviewQuestions.sort((a, b) => a.order - b.order),
    },
  });
});

/**
 * GET /quizzes/:quizId/review
 * ---------------------------------------------------------------------------
 * QUIZ-LEVEL answer review, for cases where the attempt-based endpoint above
 * cannot be used because the student has NO submitted attempt.
 *
 * This is NOT a separate "review system" and it does NOT create a fake
 * attempt: it reads the quiz's own questions (the single, canonical source of
 * correct answers) and renders them with the requesting student's answers.
 *
 *   - A student who never entered the exam simply has no answer for any
 *     question, so every question resolves to studentAnswer = null and the
 *     frontend shows "Not Answered" + the correct answer.
 *   - A student who answered some questions and left others blank gets the
 *     same rows: answered ones show their pick + correct, blank ones show
 *     "Not Answered".
 *
 * The anti-cheating gate is IDENTICAL to the attempt-based endpoint: nothing
 * (including no correct answers) is returned before the teacher's end_time.
 * A teacher previewing the ended hub from their own account has no student
 * attempt, so they see every question as "Not Answered" — exactly the
 * student's experience for a never-entered exam.
 * ---------------------------------------------------------------------------
 */
router.get("/quizzes/:quizId/review", requireAuth, async (req, res) => {
  const quiz = await getQuizById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "الاختبار غير موجود." });

  /* ---- THE TIME GATE (same rule as the attempt-based review) -------- */
  if (!isQuizReleased(quiz)) {
    // Rejected BEFORE release: no per-question data (nor correct answers)
    // leaves the server.
    return res.status(403).json({
      error: "مراجعة الإجابات غير متاحة حالياً.",
      message: "ستظهر المراجعة بعد انتهاء وقت الاختبار للجميع.",
      availableAfter: quiz.endTime,
      review: null,
    });
  }

  // The requester's OWN latest submitted attempt, if any (teachers previewing
  // the hub have none). A never-entered student simply has none -> all empty.
  let attempt = null;
  if (req.user.role === "student") {
    const attempts = await listAttemptsForStudent(req.user.id);
    attempt =
      attempts
        .filter((a) => a.status === "submitted")
        .sort((a, b) =>
          String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")),
        )[0] || null;
  }

  /* ---- RELEASED: build the full per-question view ------------------ */
  const questions = await getQuestionsForQuiz(quiz.id);
  await attachImageUrls(questions);

  const totalMcq = questions.filter((q) => q.type === "mcq").length;
  const reviewQuestions = questions
    .map((question) =>
      buildReviewQuestion(question, attempt ? attempt.answers[question.id] : undefined),
    )
    .sort((a, b) => a.order - b.order);

  return res.json({
    review: {
      quiz: { id: quiz.id, title: quiz.title, endTime: quiz.endTime },
      studentName: undefined, // only meaningful on the attempt-level view
      attemptNumber: attempt ? attempt.attemptNumber : null,
      score: attempt ? attempt.score : null, // null -> frontend hides banner
      totalMcq,
      submittedAt: attempt ? attempt.submittedAt : null,
      submissionReason: attempt ? attempt.submissionReason : null,
      releasedAt: quiz.endTime,
      questions: reviewQuestions,
    },
  });
});

module.exports = router;
