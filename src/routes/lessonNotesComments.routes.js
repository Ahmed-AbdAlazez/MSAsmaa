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

// ─── TEACHER NOTES ──────────────────────────────────────────────────────────

/** List notes for a lesson (any authenticated user). */
router.get("/lessons/:lessonId/notes", requireAuth, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const notes = await prisma.lessonNote.findMany({
      where: { lessonId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ notes });
  } catch (error) {
    console.error("[notes] list error:", error);
    res.status(500).json({ error: "Failed to fetch lesson notes." });
  }
});

/** Create a new note (teacher only). */
router.post("/lessons/:lessonId/notes", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ error: "Only the teacher can add notes." });
    }

    const { lessonId } = req.params;
    const { content } = req.body || {};

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Note content is required." });
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
    res.status(500).json({ error: "Failed to create note." });
  }
});

/** Update a note (teacher only). */
router.patch("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ error: "Only the teacher can edit notes." });
    }

    const { noteId } = req.params;
    const { content } = req.body || {};

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Note content is required." });
    }

    const note = await prisma.lessonNote.update({
      where: { id: noteId },
      data: { content: content.trim() },
    });

    res.json({ note });
  } catch (error) {
    console.error("[notes] update error:", error);
    res.status(500).json({ error: "Failed to update note." });
  }
});

/** Delete a note (teacher only). */
router.delete("/notes/:noteId", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ error: "Only the teacher can delete notes." });
    }

    const { noteId } = req.params;

    await prisma.lessonNote.delete({
      where: { id: noteId },
    });

    res.json({ message: "Note deleted successfully." });
  } catch (error) {
    console.error("[notes] delete error:", error);
    res.status(500).json({ error: "Failed to delete note." });
  }
});

module.exports = router;
