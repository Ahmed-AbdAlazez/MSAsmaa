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
  getVideo,
  findVideoByLessonId,
  findAllVideosByLessonId,
  buildTitle,
  parseLessonTitle: parseTitle,
} = require("../services/bunny.service.js");

// Sanitize user text before embedding it in the Bunny title:
// "|" is our metadata separator and must never come from user input.
const cleanTitlePart = (s) =>
  String(s || "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();

// ⚠️ STUB imports — see "STUBS TO REPLACE LATER" in VIDEO_INTEGRATION_README.md
const {
  isStudentEnrolledInLessonCourse,
} = require("../services/enrollment.stub.service.js");
const {
  saveLessonVideoId,
  getLessonVideoId,
} = require("../services/lesson.stub.service.js");
const {
  createNotificationForEnrolledStudents,
} = require("../services/notifications.stub.service.js");

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
  const rawTitle = ((req.body && req.body.title) || "شرح الدرس").trim();
  const attachmentUrl = ((req.body && req.body.attachmentUrl) || "").trim();
  const description = ((req.body && req.body.description) || "").trim();

  // Sanitize: "|" is our metadata separator inside the Bunny title.

  // TITLE CONVENTION — the platform remembers a lesson's video AND its
  // optional metadata WITHOUT a database (Bunny does not persist video
  // descriptions, verified against their API):
  //   "lesson-N | name"                               (minimum)
  //   "lesson-N | name | attachmentUrl | description"  (optional extras)
  const videoTitle = buildTitle(
    lessonId,
    cleanTitlePart(rawTitle),
    cleanTitlePart(attachmentUrl),
    cleanTitlePart(description)
  );

  try {
    // Ask Bunny to reserve a slot for this video; Bunny returns its own ID
    // inside the field "guid".
    const createdVideo = await createVideo(videoTitle);
    const bunnyVideoId = createdVideo.guid;

    // Also cache the mapping in memory (local dev convenience only —
    // Bunny's title remains the source of truth).
    await saveLessonVideoId(lessonId, bunnyVideoId);

    // Trigger notification for enrolled students using the shared function
    const notifyMessage = `فيديو جديد لدرس "${rawTitle}" متاح الآن للمشاهدة.`;
    const notifyLink = `/lesson-view.html?lesson=${lessonId}`;
    await createNotificationForEnrolledStudents("biology", notifyMessage, notifyLink);

    return res.status(201).json({
      message:
        "Video created on Bunny. Upload the file to uploadUrl using an HTTP PUT request.",
      lessonId,
      videoId: bunnyVideoId,
      uploadUrl: getUploadUrl(bunnyVideoId),
      // ⚠️ TEST-ONLY: the browser needs this header value to PUT the file
      // directly to Bunny (serverless proxies can't stream big files).
      // Replace with TUS resumable uploads or a streaming proxy before
      // real students/teachers use this in production.
      accessKey: require("../config/bunny.env.config.js").apiKey,
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
    // Resolve the lesson's video ID. Order:
    //   1. In-memory cache (fast, survives within one server process)
    //   2. Bunny title search (source of truth — works on serverless
    //      where memory is empty, and for videos named in the dashboard)
    let lessonVideoId = await getLessonVideoId(req.params.lessonId);

    if (!lessonVideoId) {
      lessonVideoId = await findVideoByLessonId(req.params.lessonId);
    }

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

/**
 * GET /api/lessons/:lessonId/video-status
 *
 * Upload UI helper. After the browser PUTs the file to Bunny, Bunny still
 * needs time to encode. The teacher dashboard polls this endpoint to show
 * live progress until the video is watchable.
 */
router.get("/:lessonId/video-status", requireAuth, async (req, res) => {
  try {
    let videoId = await getLessonVideoId(req.params.lessonId);
    if (!videoId) {
      videoId = await findVideoByLessonId(req.params.lessonId);
    }

    if (!videoId) {
      return res.status(404).json({
        error: "لم يتم رفع فيديو لهذا الدرس بعد.",
      });
    }

    const video = await getVideo(videoId);

    return res.json({
      lessonId: req.params.lessonId,
      videoId,
      title: video.title,
      ...parseTitle(video.title),
      status: video.status,
      encodeProgress: video.encodeProgress,
      lengthSeconds: video.length,
      ready: video.status === 4,
    });
  } catch (error) {
    console.error(
      `[video.routes] Status check failed for lesson ${req.params.lessonId}:`,
      error
    );
    return res.status(500).json({
      error: "Failed to check the video status. Please try again later.",
    });
  }
});

/**
 * GET /api/lessons/:lessonId/videos
 *
 * Lists ALL videos of a lesson (a lesson may have several parts), each with
 * its parsed metadata and a fresh signed playback URL. Gated by the same
 * enrollment check as video-url.
 */
router.get("/:lessonId/videos", requireAuth, async (req, res) => {
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
    const items = await findAllVideosByLessonId(req.params.lessonId);

    return res.json({
      lessonId: req.params.lessonId,
      videos: items.map((video) => ({
        videoId: video.guid,
        ...parseTitle(video.title),
        status: video.status,
        ready: video.status === 4,
        encodeProgress: video.encodeProgress,
        lengthSeconds: video.length,
        dateUploaded: video.dateUploaded,
        playbackUrl: generateSignedPlaybackUrl(
          video.guid,
          PLAYBACK_URL_LIFETIME_SECONDS
        ),
        expiresInSeconds: PLAYBACK_URL_LIFETIME_SECONDS,
      })),
    });
  } catch (error) {
    console.error(
      `[video.routes] Video list failed for lesson ${req.params.lessonId}:`,
      error
    );
    return res.status(500).json({
      error: "Failed to load the lesson videos. Please try again later.",
    });
  }
});

module.exports = router;
