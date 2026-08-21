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

const router = express.Router();

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

module.exports = router;
