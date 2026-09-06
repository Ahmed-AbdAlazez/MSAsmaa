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
const { prisma } = require("../config/db.js");

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

const {
  startVideoStatusMonitoring,
} = require("../services/video-monitoring.service.js");

// Sanitize user text before embedding it in the Bunny title:
// "|" is our metadata separator and must never come from user input.
const cleanTitlePart = (s) =>
  String(s || "")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();

// ⚠️ STUB imports — see "STUBS TO REPLACE LATER" in VIDEO_INTEGRATION_README.md
const {
  isStudentEnrolledInLessonCourse,
} = require("../services/enrollment.stub.service.js");
const {
  saveLessonVideoId,
  getLessonVideoId,
} = require("../services/lesson.stub.service.js");
const {
  createNotificationForApprovedStudents,
  createNotificationForTeacher,
} = require("../services/notifications.service.js");

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
      error: "المعلمات فقط يمكنهن رفع فيديوهات الدروس.",
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
    cleanTitlePart(description),
  );

  try {
    // Ask Bunny to reserve a slot for this video; Bunny returns its own ID
    // inside the field "guid".
    const createdVideo = await createVideo(videoTitle);
    const bunnyVideoId = createdVideo.guid;

    // Also cache the mapping in memory (local dev convenience only —
    // Bunny's title remains the source of truth).
    await saveLessonVideoId(lessonId, bunnyVideoId);

    // 📢 NOTIFY ALL PARTIES
    // Send notification to all approved students
    await createNotificationForApprovedStudents({
      type: "video",
      title: "فيديو جديد",
      message: `تم إضافة فيديو جديد: ${rawTitle}`,
      relatedId: lessonId,
      relatedType: "lesson",
      link: `/lesson-view?lesson=${encodeURIComponent(lessonId)}`,
    });

    // Also notify the teacher who uploaded it
    await createNotificationForTeacher(req.user.id, {
      type: "video_upload",
      title: "📹 تم رفع الفيديو",
      message: `تم رفع الفيديو "${rawTitle}" بنجاح. جاري معالجة الفيديو...`,
      relatedId: lessonId,
      relatedType: "lesson",
      link: `/dashboard-teacher?tab=manage-videos&lesson=${encodeURIComponent(lessonId)}`,
    });

    // ⚠️ START BACKGROUND MONITORING
    // After the teacher finishes uploading, Bunny encodes asynchronously.
    // This monitoring detects when encoding completes OR fails.
    // If it fails, we automatically notify the teacher and clean up.
    startVideoStatusMonitoring(bunnyVideoId, lessonId, req.user.id, {
      pollIntervalMs: 30000, // Check every 30 seconds
      maxDurationMs: 24 * 60 * 60 * 1000, // Stop after 24 hours
    });

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
    console.error(
      `[video.routes] Upload prep failed for lesson ${lessonId}:`,
      error,
    );
    return res.status(500).json({
      error: "فشل تجهيز رفع الفيديو. يرجى المحاولة لاحقاً.",
    });
  }
});

/**
 * GET /api/lessons/:lessonId/video-url
 *
 * Playback flow. Returns a short-lived signed playback URL for the lesson's
 * video — but only after the enrollment check below says the user may watch
 * AND the video is confirmed ready (status === 4).
 *
 * IMPORTANT: Students NEVER see processing or failed videos.
 * A processing video simply doesn't exist from the student's perspective.
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
    req.params.lessonId,
  );

  if (!studentIsEnrolled) {
    return res.status(403).json({
      error: "أنت غير مسجلة في الكورس الذي يتبع له هذا الدرس.",
    });
  }

  try {
    // Resolve the lesson's video ID. Order:
    //   1. In-memory cache (fast, survives within one server process)
    //   2. Bunny title search (source of truth — works on serverless
    //      where memory is empty, and for videos named in the dashboard)
    let lessonVideoId = await getLessonVideoId(req.params.lessonId);

    if (!lessonVideoId) {
      lessonVideoId = await findVideoByLessonId(req.params.lessonId).catch(() => null);
    }

    if (!lessonVideoId) {
      // Check if a YouTube video exists in the database for this lesson
      const ytRecord = await prisma.lessonVideo.findFirst({
        where: { lessonId: req.params.lessonId, videoSource: "youtube" },
        orderBy: { createdAt: "desc" },
      }).catch(() => null);

      if (ytRecord) {
        return res.json({
          lessonId: req.params.lessonId,
          videoId: ytRecord.id,
          videoSource: "youtube",
          youtubeVideoId: ytRecord.youtubeVideoId,
          expiresInSeconds: PLAYBACK_URL_LIFETIME_SECONDS,
          playbackUrl: `https://www.youtube.com/embed/${ytRecord.youtubeVideoId}?rel=0&controls=1`,
        });
      }

      // 404, not 403: the user IS allowed to watch, there just isn't a video
      // uploaded yet.
      return res.status(404).json({
        error: "لم يتم رفع فيديو لهذا الدرس بعد.",
      });
    }

    // ⚠️ CRITICAL: Check video status before giving student access
    // Students NEVER see processing (status < 4) or failed (status >= 5) videos
    const videoMetadata = await getVideo(lessonVideoId);
    if (!videoMetadata || videoMetadata.status !== 4) {
      // Return 404 (not "processing") so student sees "no video yet"
      return res.status(404).json({
        error: "لم يتم رفع فيديو لهذا الدرس بعد.",
      });
    }

    // Build the signed URL. It expires automatically, so students cannot
    // share a working link forever.
    const playbackUrl = generateSignedPlaybackUrl(
      lessonVideoId,
      PLAYBACK_URL_LIFETIME_SECONDS,
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
      error,
    );
    return res.status(500).json({
      error: "فشل إنشاء رابط التشغيل. يرجى المحاولة لاحقاً.",
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
      error,
    );
    return res.status(500).json({
      error: "فشل التحقق من حالة الفيديو. يرجى المحاولة لاحقاً.",
    });
  }
});

/**
 * GET /api/lessons/:lessonId/videos
 *
 * Lists ALL videos of a lesson (a lesson may have several parts), each with
 * its parsed metadata and a fresh signed playback URL. Gated by the same
 * enrollment check as video-url.
 *
 * CRITICAL: Only returns videos with status === 4 (ready).
 * Processing and failed videos are NEVER shown to students — they simply
 * don't appear in the list. Teachers see all statuses in their management view.
 */
const {
  validateYouTubeUrl,
  extractYouTubeId,
} = require("../services/youtube.service.js");

/**
 * POST /api/lessons/:lessonId/youtube-video  (teacher only)
 *
 * Adds a YouTube video to a lesson.
 * Validates the YouTube URL/ID server-side, stores the clean 11-char ID in the
 * database, and sends notifications.
 */
router.post("/:lessonId/youtube-video", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      error: "المعلمات فقط يمكنهن إضافة فيديوهات الدروس.",
    });
  }

  const { lessonId } = req.params;
  const rawUrl = (req.body && (req.body.youtubeUrl || req.body.url)) || "";
  const rawTitle = ((req.body && req.body.title) || "فيديو يوتيوب").trim();
  const attachmentUrl = ((req.body && req.body.attachmentUrl) || "").trim();
  const description = ((req.body && req.body.description) || "").trim();

  const validation = validateYouTubeUrl(rawUrl);
  if (!validation.valid) {
    return res.status(400).json({
      error: validation.error,
    });
  }

  try {
    const record = await prisma.lessonVideo.create({
      data: {
        lessonId,
        title: cleanTitlePart(rawTitle),
        description: cleanTitlePart(description),
        attachmentUrl: cleanTitlePart(attachmentUrl),
        videoSource: "youtube",
        youtubeVideoId: validation.videoId,
      },
    });

    // 📢 NOTIFY ALL PARTIES
    await createNotificationForApprovedStudents({
      type: "video",
      title: "فيديو جديد (يوتيوب)",
      message: `تم إضافة فيديو جديد: ${rawTitle}`,
      relatedId: lessonId,
      relatedType: "lesson",
      link: `/lesson-view?lesson=${encodeURIComponent(lessonId)}`,
    });

    await createNotificationForTeacher(req.user.id, {
      type: "video_upload",
      title: "📹 تم إضافة فيديو يوتيوب",
      message: `تم إضافة الفيديو "${rawTitle}" بنجاح.`,
      relatedId: lessonId,
      relatedType: "lesson",
      link: `/dashboard-teacher?tab=manage-videos&lesson=${encodeURIComponent(lessonId)}`,
    });

    return res.status(201).json({
      message: "تم إضافة فيديو يوتيوب بنجاح.",
      lessonId,
      videoId: record.id,
      videoSource: "youtube",
      youtubeVideoId: validation.videoId,
      embedUrl: `https://www.youtube.com/embed/${validation.videoId}?rel=0&controls=1`,
      title: record.title,
    });
  } catch (error) {
    console.error(
      `[video.routes] YouTube video creation failed for lesson ${lessonId}:`,
      error
    );
    return res.status(500).json({
      error: "فشل إضافة فيديو يوتيوب. يرجى المحاولة لاحقاً.",
    });
  }
});

/**
 * GET /api/lessons/:lessonId/videos
 *
 * Lists ALL videos of a lesson (both Bunny Stream and YouTube), each with
 * metadata and playback URLs. Gated by enrollment check.
 */
router.get("/:lessonId/videos", requireAuth, async (req, res) => {
  const studentIsEnrolled = await isStudentEnrolledInLessonCourse(
    req.user.id,
    req.params.lessonId,
  );
  if (!studentIsEnrolled) {
    return res.status(403).json({
      error: "أنت غير مسجلة في الكورس الذي يتبع له هذا الدرس.",
    });
  }

  try {
    // 1. Fetch Bunny videos
    const items = await findAllVideosByLessonId(req.params.lessonId).catch((err) => {
      console.warn(`[video.routes] Bunny fetch failed for ${req.params.lessonId}:`, err.message);
      return [];
    });
    const readyBunnyVideos = items.filter((video) => video.status === 4);
    const bunnyVideoIds = readyBunnyVideos.map((video) => video.guid);

    const chapters = await prisma.videoChapter.findMany({
      where: { videoId: { in: bunnyVideoIds } },
      orderBy: { orderIndex: "asc" },
    });

    const chaptersByVideo = {};
    bunnyVideoIds.forEach((id) => {
      chaptersByVideo[id] = [];
    });
    chapters.forEach((ch) => {
      if (!chaptersByVideo[ch.videoId]) {
        chaptersByVideo[ch.videoId] = [];
      }
      chaptersByVideo[ch.videoId].push(ch);
    });

    const bunnyFormatted = readyBunnyVideos.map((video) => ({
      videoId: video.guid,
      videoSource: "bunny",
      bunnyVideoId: video.guid,
      ...parseTitle(video.title),
      status: video.status,
      ready: video.status === 4,
      encodeProgress: video.encodeProgress,
      lengthSeconds: video.length,
      dateUploaded: video.dateUploaded,
      playbackUrl: generateSignedPlaybackUrl(
        video.guid,
        PLAYBACK_URL_LIFETIME_SECONDS,
      ),
      expiresInSeconds: PLAYBACK_URL_LIFETIME_SECONDS,
      chapters: chaptersByVideo[video.guid] || [],
    }));

    // 2. Fetch YouTube videos from database
    const ytRecords = await prisma.lessonVideo.findMany({
      where: {
        lessonId: req.params.lessonId,
        videoSource: "youtube",
      },
      orderBy: { createdAt: "asc" },
    });

    const ytFormatted = ytRecords.map((yt) => ({
      videoId: yt.id,
      id: yt.id,
      videoSource: "youtube",
      youtubeVideoId: yt.youtubeVideoId,
      name: yt.title,
      description: yt.description || "",
      attachmentUrl: yt.attachmentUrl || "",
      status: 4,
      ready: true,
      playbackUrl: `https://www.youtube.com/embed/${yt.youtubeVideoId}?rel=0&controls=1`,
      embedUrl: `https://www.youtube.com/embed/${yt.youtubeVideoId}?rel=0&controls=1`,
      dateUploaded: yt.createdAt,
      chapters: [],
    }));

    return res.json({
      lessonId: req.params.lessonId,
      videos: [...bunnyFormatted, ...ytFormatted],
    });
  } catch (error) {
    console.error(
      `[video.routes] Video list failed for lesson ${req.params.lessonId}:`,
      error,
    );
    return res.status(500).json({
      error: "فشل تحميل فيديوهات الدرس. يرجى المحاولة لاحقاً.",
    });
  }
});

module.exports = router;

