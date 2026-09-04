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
} = require("../../services/quiz.stub.service.js");

const router = express.Router();

// Per-route gates (see quizCreation.routes.js for why NOT router.use).
// Any authenticated user may CALL the endpoint, but ownership is enforced
// inside: students can only ever open their own result.

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

  const reviewQuestions = questions.map((question) => {
    const submittedEntry = attempt.answers[question.id];

    if (question.type === "mcq") {
      const chosenChoiceId = submittedEntry ? submittedEntry.value : null;
      const wasCorrect = chosenChoiceId === question.correctChoiceId;

      // Send BOTH choices as full objects so the frontend renders text,
      // and the explicit flags it needs for red/green coloring.
      return {
        questionId: question.id,
        order: question.order,
        type: "mcq",
        text: question.text,
        imageUrl: question.signedImageUrl || null,
        choices: question.choices, // includes every choice with its id/text
        studentChoiceId: chosenChoiceId,
        correctChoiceId: question.correctChoiceId, // now allowed: past end_time
        wasCorrect,
        answered: Boolean(chosenChoiceId),
        // NOTE: no grading info is ever attached to written questions; here
        // we simply don't have that concept for mcq-vs-written mixing.
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
      studentAnswer: submittedEntry ? submittedEntry.value : null,
      modelAnswer: question.modelAnswer, // teacher reference, display-only
    };
  });

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

module.exports = router;
