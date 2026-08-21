/**
 * video.routes.js
 * ---------------------------------------------------------------------------
 * Express routes for uploading lesson videos to Bunny Stream and getting
 * secure, signed playback URLs for them.
 *
 * Routes defined here (relative paths — they are mounted under /api/lessons):
 *
 *   POST /api/lessons/:lessonId/video
 *        Teacher-only. Creates a video entry on Bunny and returns the URL
 *        the teacher's browser should upload the file to.
 *
 *   GET /api/lessons/:lessonId/video-url
 *        Student-facing. Returns a short-lived signed playback URL, but ONLY
 *        if the student passes the enrollment check.
 *
 * This file contains NO direct Bunny API calls and NO database calls.
 * It only orchestrates: auth -> permission check -> services -> response.
 */

const express = require("express");

// Provided by the existing project (contract): guarantees req.user.id and
// req.user.role are set for every request that reaches the handler below.
const { requireAuth } = require("../middleware/auth.middleware.js");

const {
  createVideo,
  getUploadUrl,
  generateSignedPlaybackUrl,
} = require("../services/bunny.service.js");

// ⚠️ STUB imports — see "STUBS TO REPLACE LATER" in VIDEO_INTEGRATION_README.md
const {
  isStudentEnrolledInLessonCourse,
} = require("../services/enrollment.stub.service.js");
const {
  saveLessonVideoId,
  getLessonVideoId,
} = require("../services/lesson.stub.service.js");

const router = express.Router();

/**
 * How long a signed playback URL stays valid once issued (3 hours).
 * Kept as a named constant so it is easy to find and change later.
 */
const PLAYBACK_URL_LIFETIME_SECONDS = 60 * 60 * 3;

/**
 * POST /api/lessons/:lessonId/video  (teacher only)
 *
 * Step 1 of the upload flow. Does NOT receive the video file itself.
 * Instead it:
 *   1. Verifies the caller is a teacher.
 *   2. Asks Bunny to create an empty video entry (Bunny replies with an ID).
 *   3. Saves that ID against the lesson (via the stub service for now).
 *   4. Returns the upload URL so the teacher's browser can PUT the actual
 *      file straight to Bunny in step 2 of the flow.
 *
 * Request body (optional): { "title": "Chapter 1 - Cell Structure" }
 * If no title is sent we fall back to a generic one based on the lesson ID.
 */
router.post("/:lessonId/video", requireAuth, async (req, res) => {
  // Role check. requireAuth already proved WHO the user is; this proves they
  // are ALLOWED to upload. Students must never reach the code below.
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      error: "Only teachers can upload lesson videos.",
    });
  }

  const { lessonId } = req.params;
  const videoTitle = req.body.title || `Lesson ${lessonId}`;

  try {
    // Ask Bunny to reserve a slot for this video; Bunny returns its own ID
    // inside the field "guid".
    const createdVideo = await createVideo(videoTitle);
    const bunnyVideoId = createdVideo.guid;

    // Remember which video belongs to this lesson (in-memory stub for now).
    await saveLessonVideoId(lessonId, bunnyVideoId);

    return res.status(201).json({
      message:
        "Video created on Bunny. Upload the file to uploadUrl using an HTTP PUT request.",
      lessonId,
      videoId: bunnyVideoId,
      uploadUrl: getUploadUrl(bunnyVideoId),
    });
  } catch (error) {
    console.error(`[video.routes] Upload prep failed for lesson ${lessonId}:`, error);
    return res.status(500).json({
      error: "Failed to prepare the video upload. Please try again later.",
    });
  }
});

/**
 * GET /api/lessons/:lessonId/video-url
 *
 * Playback flow. Returns a short-lived signed playback URL for the lesson's
 * video — but only after the enrollment check below says the user may watch.
 */
router.get("/:lessonId/video-url", requireAuth, async (req, res) => {
  /* ======================================================================
   * MAIN ACCESS CONTROL POINT — DO NOT BYPASS OR SIMPLIFY
   * ======================================================================
   * This enrollment check is THE gate that decides who is allowed to watch
   * paid course content. Everything else in this file is convenience;
   * THIS is security.
   *
   * Rules for now AND for the future:
   *   1. Never remove this check, reorder the route around it, or move it
   *      client-side. The signed URL must only ever be handed out AFTER
   *      this check passes on the server.
   *   2. Right now the function is a STUB that always returns true (see
   *      src/services/enrollment.stub.service.js). That is temporary.
   *      When the real database lands, replace the STUB FILE — do NOT
   *      "simplify" this route by deleting or weakening the call itself.
   *   3. A false result MUST keep returning 403 Forbidden. Do not log the
   *      user out, do not fall through, do not return a preview URL.
   * ====================================================================== */
  const studentIsEnrolled = await isStudentEnrolledInLessonCourse(
    req.user.id,
    req.params.lessonId
  );

  if (!studentIsEnrolled) {
    return res.status(403).json({
      error: "You are not enrolled in the course this lesson belongs to.",
    });
  }

  try {
    // Look up which Bunny video belongs to this lesson (stub storage for now).
    const lessonVideoId = await getLessonVideoId(req.params.lessonId);

    if (!lessonVideoId) {
      // 404, not 403: the user IS allowed to watch, there just isn't a video
      // uploaded yet.
      return res.status(404).json({
        error: "No video has been uploaded for this lesson yet.",
      });
    }

    // Build the signed URL. It expires automatically, so students cannot
    // share a working link forever.
    const playbackUrl = generateSignedPlaybackUrl(
      lessonVideoId,
      PLAYBACK_URL_LIFETIME_SECONDS
    );

    return res.json({
      lessonId: req.params.lessonId,
      videoId: lessonVideoId,
      expiresInSeconds: PLAYBACK_URL_LIFETIME_SECONDS,
      playbackUrl,
    });
  } catch (error) {
    console.error(
      `[video.routes] Playback URL failed for lesson ${req.params.lessonId}:`,
      error
    );
    return res.status(500).json({
      error: "Failed to create the playback URL. Please try again later.",
    });
  }
});

module.exports = router;
