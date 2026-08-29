/**
 * lessonNotesComments.routes.js
 * ---------------------------------------------------------------------------
 * CRUD endpoints for teacher lesson notes.
 *
 * Teacher Notes (Ms Asmaa):
 *   GET    /api/lessons/:lessonId/notes          list notes for a lesson
 *   POST   /api/lessons/:lessonId/notes          create a note (teacher only)
 *   PATCH  /api/notes/:noteId                   update a note (teacher only)
 *   DELETE /api/notes/:noteId                   delete a note (teacher only)
 */

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth.middleware");
const { prisma } = require("../config/db");
const {
  isStudentEnrolledInLessonCourse,
} = require("../services/enrollment.stub.service.js");

// ─── TEACHER NOTES ──────────────────────────────────────────────────────────

/** List notes for a lesson (approved students only; teacher full access). */
router.get("/lessons/:lessonId/notes", requireAuth, async (req, res) => {
  try {
    const studentIsEnrolled = await isStudentEnrolledInLessonCourse(
      req.user.id,
      req.params.lessonId
    );
    if (!studentIsEnrolled) {
      return res.status(403).json({
        error: "أنت غير مسجلة في الكورس الذي يتبع له هذا الدرس.",
      });
    }

    const { lessonId } = req.params;
    const notes = await prisma.lessonNote.findMany({
      where: { lessonId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ notes });
  } catch (error) {
    console.error("[notes] list error:", error);
    res.status(500).json({ error: "فشل تحميل ملاحظات الدرس." });
  }
});

/** Create a new note (teacher only). */
router.post("/lessons/:lessonId/notes", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ error: "المعلمة فقط يمكنها إضافة ملاحظات." });
    }

    const { lessonId } = req.params;
    const { content } = req.body || {};

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "محتوى الملاحظة مطلوب." });
    }

    const note = await prisma.lessonNote.create({
      data: {
        lessonId,
        content: content.trim(),
      },
    });

    res.status(201).json({ note });
  } catch (error) {
    console.error("[notes] create error:", error);
    res.status(500).json({ error: "فشل إنشاء الملاحظة." });
  }
});

/** Update a note (teacher only). */
router.patch("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ error: "المعلمة فقط يمكنها تعديل الملاحظات." });
    }

    const { noteId } = req.params;
    const { content } = req.body || {};

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "محتوى الملاحظة مطلوب." });
    }

    const note = await prisma.lessonNote.update({
      where: { id: noteId },
      data: { content: content.trim() },
    });

    res.json({ note });
  } catch (error) {
    console.error("[notes] update error:", error);
    res.status(500).json({ error: "فشل تعديل الملاحظة." });
  }
});

/** Delete a note (teacher only). */
router.delete("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ error: "المعلمة فقط يمكنها حذف الملاحظات." });
    }

    const { noteId } = req.params;

    await prisma.lessonNote.delete({
      where: { id: noteId },
    });

    res.json({ message: "Note deleted successfully." });
  } catch (error) {
    console.error("[notes] delete error:", error);
    res.status(500).json({ error: "فشل حذف الملاحظة." });
  }
});

module.exports = router;
