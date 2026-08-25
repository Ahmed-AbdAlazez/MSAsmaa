/**
 * quizManagement.routes.js
 * ---------------------------------------------------------------------------
 * TEACHER-ONLY endpoints for managing existing quizzes:
 *   GET  /api/quizzes                        teacher's quizzes list
 *   GET  /api/quizzes/:quizId/full           quiz with full questions & answers
 *   PUT  /api/quizzes/:quizId                edit settings (before start only):
 *                                            title, lesson, window, duration,
 *                                            question count
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
  getQuestionsForQuiz,
  deleteQuiz,
  deleteQuestionFromQuiz,
  updateQuestion,
  updateQuizMeta,
  getTeacherQuizzes,
  getTeacherQuiz,
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
    const quiz = await getTeacherQuiz(req.params.quizId, req.user.id);
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
        const quiz = await getTeacherQuiz(req.params.quizId, req.user.id);
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
        const quiz = await getTeacherQuiz(req.params.quizId, req.user.id);
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
 * PUT /quizzes/:quizId (teacher-only)
 * Edit the quiz SETTINGS — title, lesson, start/end window, solving
 * duration and declared question count. Only allowed BEFORE the quiz's
 * start time (same rule as question edits). Deleting the whole quiz stays
 * possible at ANY time via DELETE below.
 */
router.put("/quizzes/:quizId", requireAuth, requireTeacher, async (req, res) => {
  try {
    const quiz = await getTeacherQuiz(req.params.quizId, req.user.id);
    if (!quiz) {
      return res.status(404).json({ error: "الاختبار غير موجود." });
    }

    if (new Date() >= new Date(quiz.startTime)) {
      return res.status(403).json({
        error: "لا يمكن تعديل إعدادات الاختبار بعد بدئه. يمكنك حذفه في أي وقت.",
      });
    }

    const body = req.body || {};
    const data = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) return res.status(400).json({ error: "عنوان الاختبار مطلوب." });
      data.title = title;
    }
    if (body.lessonId !== undefined) {
      const lessonId = String(body.lessonId).trim();
      if (!lessonId) return res.status(400).json({ error: "الدرس مطلوب." });
      data.lessonId = lessonId;
    }

    // Window: validate as a pair so end always stays after start.
    let startMs = Date.parse(quiz.startTime);
    let endMs = Date.parse(quiz.endTime);
    if (body.startTime !== undefined) {
      startMs = Date.parse(body.startTime);
      if (!Number.isFinite(startMs)) {
        return res.status(400).json({ error: "وقت البدء غير صالح." });
      }
    }
    if (body.endTime !== undefined) {
      endMs = Date.parse(body.endTime);
      if (!Number.isFinite(endMs)) {
        return res.status(400).json({ error: "وقت النهاية غير صالح." });
      }
    }
    if (endMs <= startMs) {
      return res.status(400).json({ error: "وقت النهاية يجب أن يكون بعد وقت البدء." });
    }
    data.startTime = new Date(startMs).toISOString();
    data.endTime = new Date(endMs).toISOString();

    if (body.durationMinutes !== undefined) {
      const duration = Number(body.durationMinutes);
      if (!Number.isFinite(duration) || duration <= 0) {
        return res.status(400).json({ error: "مدة الحل يجب أن تكون عدداً موجباً." });
      }
      data.durationMinutes = duration;
    }

    if (body.questionCount !== undefined) {
      const questionCount = Number(body.questionCount);
      if (!Number.isInteger(questionCount) || questionCount < 1) {
        return res.status(400).json({ error: "عدد الأسئلة غير صالح." });
      }
      const actualCount = (await getQuestionsForQuiz(quiz.id)).length;
      if (questionCount < actualCount) {
        return res.status(400).json({
          error: `يوجد ${actualCount} سؤال مضاف بالفعل — لا يمكن جعل العدد أقل منه.`,
        });
      }
      data.questionCount = questionCount;
    }

    const updated = await updateQuizMeta(quiz.id, data);
    if (!updated) {
      return res.status(404).json({ error: "الاختبار غير موجود." });
    }

    return res.json({
      message: "تم تحديث إعدادات الاختبار بنجاح.",
      quiz: updated,
    });
  } catch (error) {
    console.error("[quizManagement] updateQuizSettings error:", error);
    return res.status(500).json({ error: "تعذر تحديث إعدادات الاختبار." });
  }
});

/**
 * DELETE /quizzes/:quizId (teacher-only)
 * Delete the entire quiz and all its questions. ALWAYS allowed (no time gate).
 */
router.delete("/quizzes/:quizId", requireAuth, requireTeacher, async (req, res) => {
  try {
      const quiz = await getTeacherQuiz(req.params.quizId, req.user.id);
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
