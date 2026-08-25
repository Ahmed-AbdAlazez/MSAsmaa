/**
 * quizManagement.routes.js
 * ---------------------------------------------------------------------------
 * TEACHER-ONLY endpoints for managing existing quizzes:
 *   GET  /api/quizzes                        teacher's quizzes list
 *   GET  /api/quizzes/:quizId/full           quiz with full questions & answers
 *   DELETE /api/quizzes/:quizId              delete entire quiz (always allowed)
 *   PUT  /api/quizzes/:quizId/questions/:questionId   edit question (before start time only)
 *   DELETE /api/quizzes/:quizId/questions/:questionId delete question (before start time only)
 *
 * All require authentication + teacher role.
 */

const express = require("express");
const { requireAuth } = require("../../middleware/auth.middleware.js");
const { requireTeacher, attachImageUrls } = require("./quiz.helpers.js");
const {
  getQuizById,
  getQuestionsForQuiz,
  deleteQuiz,
  deleteQuestionFromQuiz,
  updateQuestion,
  getTeacherQuizzes,
} = require("../../services/quiz.stub.service.js");

const router = express.Router();

/**
 * GET /quizzes (teacher-only)
 * Returns a list of all quizzes created by the current teacher.
 */
router.get("/quizzes-managed", requireAuth, requireTeacher, async (req, res) => {
  try {
    const quizzes = await getTeacherQuizzes(req.user.id);
    return res.json({
      quizzes: quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        lessonId: q.lessonId,
        courseId: q.courseId,
        questionCount: q.questionCount,
        startTime: q.startTime,
        endTime: q.endTime,
        durationMinutes: q.durationMinutes,
        createdAt: q.createdAt,
        canEdit: new Date() < new Date(q.startTime), // Before start time
      })),
    });
  } catch (error) {
    console.error("[quizManagement] getTeacherQuizzes error:", error);
    return res.status(500).json({ error: "تعذر تحميل الاختبارات." });
  }
});

/**
 * GET /quizzes/:quizId/full (teacher-only)
 * Returns the FULL quiz with all questions and answers (teacher-only view).
 */
router.get("/quizzes/:quizId/full", requireAuth, requireTeacher, async (req, res) => {
  try {
    const quiz = await getQuizById(req.params.quizId);
    if (!quiz) {
      return res.status(404).json({ error: "الاختبار غير موجود." });
    }

    const questions = await getQuestionsForQuiz(quiz.id);
    await attachImageUrls(questions);

    const canEdit = new Date() < new Date(quiz.startTime);

    return res.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        lessonId: quiz.lessonId,
        courseId: quiz.courseId,
        questionCount: quiz.questionCount,
        startTime: quiz.startTime,
        endTime: quiz.endTime,
        durationMinutes: quiz.durationMinutes,
        createdAt: quiz.createdAt,
        canEdit,
        canDelete: true, // Always can delete entire quiz
      },
      questions: questions
        .sort((a, b) => a.order - b.order)
        .map((q) => ({
          id: q.id,
          order: q.order,
          type: q.type,
          text: q.text,
          imageUrl: q.signedImageUrl || null,
          ...(q.type === "mcq"
            ? {
                choices: q.choices,
                correctChoiceId: q.correctChoiceId,
              }
            : {
                modelAnswer: q.modelAnswer,
              }),
        })),
    });
  } catch (error) {
    console.error("[quizManagement] getFullQuiz error:", error);
    return res.status(500).json({ error: "تعذر تحميل الاختبار." });
  }
});

/**
 * PUT /quizzes/:quizId/questions/:questionId (teacher-only)
 * Update a single question (text, answer, correct choice). 
 * Only allowed BEFORE quiz start time.
 */
router.put(
  "/quizzes/:quizId/questions/:questionId",
  requireAuth,
  requireTeacher,
  async (req, res) => {
    try {
      const quiz = await getQuizById(req.params.quizId);
      if (!quiz) {
        return res.status(404).json({ error: "الاختبار غير موجود." });
      }

      // Check if quiz has started
      if (new Date() >= new Date(quiz.startTime)) {
        return res.status(403).json({
          error: "لا يمكن تعديل الأسئلة بعد بدء الاختبار.",
        });
      }

      const { text, modelAnswer, correctChoiceId, choices } = req.body;

      if (!text) {
        return res.status(400).json({
          error: "نص السؤال مطلوب.",
        });
      }

      const updated = await updateQuestion(req.params.questionId, {
        text,
        modelAnswer,
        correctChoiceId,
        choices,
      });

      if (!updated) {
        return res.status(404).json({ error: "السؤال غير موجود." });
      }

      return res.json({
        message: "تم تحديث السؤال بنجاح.",
        question: updated,
      });
    } catch (error) {
      console.error("[quizManagement] updateQuestion error:", error);
      return res.status(500).json({ error: "تعذر تحديث السؤال." });
    }
  }
);

/**
 * DELETE /quizzes/:quizId/questions/:questionId (teacher-only)
 * Delete a single question. Only allowed BEFORE quiz start time.
 */
router.delete(
  "/quizzes/:quizId/questions/:questionId",
  requireAuth,
  requireTeacher,
  async (req, res) => {
    try {
      const quiz = await getQuizById(req.params.quizId);
      if (!quiz) {
        return res.status(404).json({ error: "الاختبار غير موجود." });
      }

      // Check if quiz has started
      if (new Date() >= new Date(quiz.startTime)) {
        return res.status(403).json({
          error: "لا يمكن حذف الأسئلة بعد بدء الاختبار.",
        });
      }

      const deleted = await deleteQuestionFromQuiz(
        req.params.quizId,
        req.params.questionId
      );

      if (!deleted) {
        return res.status(404).json({ error: "السؤال غير موجود." });
      }

      return res.json({
        message: "تم حذف السؤال بنجاح.",
      });
    } catch (error) {
      console.error("[quizManagement] deleteQuestion error:", error);
      return res.status(500).json({ error: "تعذر حذف السؤال." });
    }
  }
);

/**
 * DELETE /quizzes/:quizId (teacher-only)
 * Delete the entire quiz and all its questions. ALWAYS allowed (no time gate).
 */
router.delete("/quizzes/:quizId", requireAuth, requireTeacher, async (req, res) => {
  try {
    const quiz = await getQuizById(req.params.quizId);
    if (!quiz) {
      return res.status(404).json({ error: "الاختبار غير موجود." });
    }

    const deleted = await deleteQuiz(req.params.quizId);

    if (!deleted) {
      return res.status(404).json({ error: "الاختبار غير موجود." });
    }

    return res.json({
      message: "تم حذف الاختبار بنجاح.",
    });
  } catch (error) {
    console.error("[quizManagement] deleteQuiz error:", error);
    return res.status(500).json({ error: "تعذر حذف الاختبار." });
  }
});

module.exports = router;
