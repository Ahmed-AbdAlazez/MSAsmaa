/**
 * video-manage.routes.js
 * ---------------------------------------------------------------------------
 * Teacher-only management of already-uploaded videos (mounted under
 * /api/videos by app.js):
 *
 *   PATCH  /api/videos/:videoId   edit name / attachment link / description
 *                                  (optionally move to another lesson)
 *   DELETE /api/videos/:videoId   permanently delete the video from Bunny
 *
 * Metadata edits work by rebuilding the platform title convention:
 *   "lesson-N | name | attachmentUrl | description"
 * (see buildTitle in bunny.service.js — Bunny does not persist video
 * descriptions, so the title IS our database for now).
 */

const express = require("express");

const { requireAuth } = require("../middleware/auth.middleware.js");
const {
  getVideo,
  updateVideoTitle,
  deleteVideo,
  parseLessonTitle,
  buildTitle,
} = require("../services/bunny.service.js");

const { prisma } = require("../config/db.js");
const router = express.Router();

/** Helper: parse duration input string (mm:ss) or number to seconds. */
function parseTimeToSeconds(input) {
  if (typeof input === "number") {
    return isNaN(input) ? null : Math.floor(input);
  }
  if (typeof input !== "string") return null;
  const cleaned = input.trim();
  if (!cleaned) return null;

  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    let secs = 0;
    for (let i = 0; i < parts.length; i++) {
      const val = Number(parts[i]);
      if (isNaN(val) || val < 0) return null;
      secs = secs * 60 + val;
    }
    return secs;
  }

  const val = Number(cleaned);
  return isNaN(val) || val < 0 ? null : Math.floor(val);
}

/** Helper: validate start time against actual Bunny video length. */
async function validateChapterTime(videoId, seconds) {
  try {
    const video = await getVideo(videoId);
    if (video && video.length !== undefined && video.length > 0) {
      if (seconds > video.length) {
        return {
          valid: false,
          error: `توقيت البداية (${seconds} ثانية) لا يمكن أن يتجاوز طول الفيديو (${video.length} ثانية).`,
        };
      }
    }
  } catch (err) {
    console.warn(
      `[validateChapterTime] Warning: Could not fetch video duration from Bunny API for validation:`,
      err.message
    );
  }
  return { valid: true };
}

/** Helper: reorder chapters chronologically. */
async function reorderChapters(videoId) {
  const chapters = await prisma.videoChapter.findMany({
    where: { videoId },
    orderBy: { startTimeSeconds: "asc" },
  });

  const updates = chapters.map((chapter, index) => {
    return prisma.videoChapter.update({
      where: { id: chapter.id },
      data: { orderIndex: index },
    });
  });

  await prisma.$transaction(updates);
}

/** Teacher gate used by every route below. */
function requireTeacher(req, res, next) {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      error: "Only teachers can manage lesson videos.",
    });
  }
  next();
}

/** Sanitize user text before it goes into the title. */
const clean = (s) =>
  String(s || "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();

/**
 * PATCH /api/videos/:videoId
 * Body (all optional): { name, attachmentUrl, description, lessonId }
 * Omitted fields keep their current value.
 */
router.patch("/:videoId", requireAuth, requireTeacher, async (req, res) => {
  try {
    const video = await getVideo(req.params.videoId);
    const current = parseLessonTitle(video.title);

    const lessonId = clean(req.body.lessonId) || current.lessonId;
    const name =
      req.body.name !== undefined ? clean(req.body.name) : current.name;
    const attachmentUrl =
      req.body.attachmentUrl !== undefined
        ? clean(req.body.attachmentUrl)
        : current.attachmentUrl;
    const description =
      req.body.description !== undefined
        ? clean(req.body.description)
        : current.description;

    if (!lessonId.startsWith("lesson-")) {
      return res.status(400).json({ error: "Invalid lesson ID." });
    }

    const newTitle = buildTitle(lessonId, name, attachmentUrl, description);
    await updateVideoTitle(video.guid, newTitle);

    return res.json({
      message: "تم حفظ التعديلات بنجاح.",
      videoId: video.guid,
      lessonId,
      name,
      attachmentUrl,
      description,
    });
  } catch (error) {
    console.error("[video-manage] Edit failed:", error);
    return res.status(500).json({ error: "فشل حفظ التعديلات." });
  }
});

/**
 * DELETE /api/videos/:videoId — permanent!
 */
router.delete("/:videoId", requireAuth, requireTeacher, async (req, res) => {
  try {
    await deleteVideo(req.params.videoId);
    return res.json({ message: "تم حذف الفيديو بنجاح." });
  } catch (error) {
    console.error("[video-manage] Delete failed:", error);
    return res.status(500).json({ error: "فشل حذف الفيديو." });
  }
});

/* ==========================================================================
 * Video Chapters Management API (Teacher-only CRUD)
 * ========================================================================== */

/** GET /api/videos/:videoId/chapters */
router.get("/:videoId/chapters", requireAuth, requireTeacher, async (req, res) => {
  try {
    const { videoId } = req.params;
    const chapters = await prisma.videoChapter.findMany({
      where: { videoId },
      orderBy: { orderIndex: "asc" },
    });
    return res.json({ videoId, chapters });
  } catch (error) {
    console.error("[chapters] Get failed:", error);
    return res.status(500).json({ error: "فشل تحميل الفصول." });
  }
});

/** POST /api/videos/:videoId/chapters */
router.post("/:videoId/chapters", requireAuth, requireTeacher, async (req, res) => {
  try {
    const { videoId } = req.params;
    const { title } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res
        .status(400)
        .json({ error: "اسم الفصل مطلوب ولا يمكن أن يكون فارغاً." });
    }

    const startTimeSeconds = parseTimeToSeconds(req.body.startTimeSeconds);
    if (startTimeSeconds === null || startTimeSeconds < 0) {
      return res.status(400).json({
        error:
          "توقيت البداية غير صالح. يرجى إدخال وقت صحيح (مثال: 3:20 أو 200).",
      });
    }

    // Validate against video duration
    const validation = await validateChapterTime(videoId, startTimeSeconds);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Create and re-sort
    const newChapter = await prisma.videoChapter.create({
      data: {
        videoId,
        title: title.trim(),
        startTimeSeconds,
        orderIndex: 9999, // placeholder, will be updated by reorderChapters
      },
    });

    await reorderChapters(videoId);

    // Fetch the updated chapter with its correct orderIndex
    const saved = await prisma.videoChapter.findUnique({
      where: { id: newChapter.id },
    });

    return res.status(201).json(saved);
  } catch (error) {
    console.error("[chapters] Create failed:", error);
    return res.status(500).json({ error: "فشل إضافة الفصل." });
  }
});

/** PATCH /api/videos/chapters/:chapterId */
router.patch("/chapters/:chapterId", requireAuth, requireTeacher, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { title, startTimeSeconds: rawTime } = req.body;

    const chapter = await prisma.videoChapter.findUnique({
      where: { id: chapterId },
    });

    if (!chapter) {
      return res.status(404).json({ error: "الفصل غير موجود." });
    }

    const dataToUpdate = {};
    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "اسم الفصل غير صالح." });
      }
      dataToUpdate.title = title.trim();
    }

    if (rawTime !== undefined) {
      const startTimeSeconds = parseTimeToSeconds(rawTime);
      if (startTimeSeconds === null || startTimeSeconds < 0) {
        return res.status(400).json({ error: "توقيت البداية غير صالح." });
      }

      // Validate against video duration
      const validation = await validateChapterTime(
        chapter.videoId,
        startTimeSeconds
      );
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      dataToUpdate.startTimeSeconds = startTimeSeconds;
    }

    await prisma.videoChapter.update({
      where: { id: chapterId },
      data: dataToUpdate,
    });

    if (rawTime !== undefined) {
      await reorderChapters(chapter.videoId);
    }

    const saved = await prisma.videoChapter.findUnique({
      where: { id: chapterId },
    });

    return res.json(saved);
  } catch (error) {
    console.error("[chapters] Edit failed:", error);
    return res.status(500).json({ error: "فشل تعديل الفصل." });
  }
});

/** DELETE /api/videos/chapters/:chapterId */
router.delete("/chapters/:chapterId", requireAuth, requireTeacher, async (req, res) => {
  try {
    const { chapterId } = req.params;

    const chapter = await prisma.videoChapter.findUnique({
      where: { id: chapterId },
    });

    if (!chapter) {
      return res.status(404).json({ error: "الفصل غير موجود." });
    }

    await prisma.videoChapter.delete({
      where: { id: chapterId },
    });

    await reorderChapters(chapter.videoId);

    return res.json({
      message: "تم حذف الفصل بنجاح.",
      videoId: chapter.videoId,
    });
  } catch (error) {
    console.error("[chapters] Delete failed:", error);
    return res.status(500).json({ error: "فشل حذف الفصل." });
  }
});

module.exports = router;
