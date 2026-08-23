/**
 * quizResults.routes.js
 * ---------------------------------------------------------------------------
 * TEACHER endpoints around attempts & results:
 *   POST /api/quizzes/:quizId/students/:studentId/grant-retry
 *        grant ONE extra attempt to one student for this quiz.
 *   GET  /api/quizzes/:quizId/results
 *        every student's attempts (ALL of them are kept and shown here,
 *        even when the leaderboard only ever uses the best one).
 */

const express = require("express");

const { requireAuth } = require("../../middleware/auth.middleware.js");
const { requireTeacher } = require("./quiz.helpers.js");
const {
  getQuizById,
  getAttemptsForStudent,
  getAllAttemptsForQuiz,
  getStudentNameById,
  grantAdditionalAttempt,
  getAllowedAttemptCount,
} = require("../../services/quiz.stub.service.js");

const router = express.Router();

// Per-route gates (see quizCreation.routes.js for why NOT router.use).

/**
 * POST /quizzes/:quizId/students/:studentId/grant-retry
 * Adds exactly one allowed attempt. Nothing is deleted or reset — both the
 * old result and the upcoming second attempt stay visible in /results.
 */
router.post("/quizzes/:quizId/students/:studentId/grant-retry", requireAuth, requireTeacher, async (req, res) => {
  const quiz = await getQuizById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "الاختبار غير موجود." });

  const studentId = String(req.params.studentId || "").trim();
  if (!studentId) {
    return res.status(400).json({ error: "معرّف الطالب مطلوب." });
  }

  const newAllowance = await grantAdditionalAttempt(quiz.id, studentId);
  const studentName = await getStudentNameById(studentId);

  return res.json({
    message: `تم منح ${studentName} محاولة إضافية.`,
    quizId: quiz.id,
    studentId,
    allowedAttempts: newAllowance,
  });
});

/**
 * GET /quizzes/:quizId/results — teacher view of every attempt.
 * Groups by student; includes in-progress attempts so the teacher can see
 * who currently has a quiz open (score null until submitted).
 */
router.get("/quizzes/:quizId/results", requireAuth, requireTeacher, async (req, res) => {
  const quiz = await getQuizById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "الاختبار غير موجود." });

  // Every attempt row (submitted AND in-progress) so the teacher also sees
  // who currently has the quiz open with a null score.
  const allAttempts = await getAllAttemptsForQuiz(quiz.id);

  // Group per student.
  const studentIds = new Set(allAttempts.map((r) => r.studentId));

  const grouped = new Map();
  for (const studentId of studentIds) {
    const attempts = await getAttemptsForStudent(quiz.id, studentId);
    grouped.set(studentId, {
      studentId,
      studentName: await getStudentNameById(studentId),
      allowedAttempts: await getAllowedAttemptCount(quiz.id, studentId),
      bestScore: Math.max(
        ...attempts
          .filter((a) => a.status === "submitted")
          .map((a) => a.score)
          .concat(0)
      ),
      attempts: attempts.map((attempt) => ({
        resultId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        score: attempt.score,
        totalMcq: attempt.totalMcq,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        submissionReason: attempt.submissionReason,
      })),
    });
  }

  return res.json({
    quiz: { id: quiz.id, title: quiz.title },
    students: [...grouped.values()].sort((a, b) => b.bestScore - a.bestScore),
  });
});

module.exports = router;
