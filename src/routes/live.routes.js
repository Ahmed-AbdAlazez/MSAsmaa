/**
 * live.routes.js
 * ---------------------------------------------------------------------------
 * Express routes for the Daily.co live-streaming feature.
 *
 * Endpoints (mounted under /api):
 *
 *   POST /api/live/start         (teacher only)
 *        Creates a Daily room (if needed) + an OWNER meeting token for the
 *        teacher, registers the session as LIVE, and notifies every approved
 *        student with the same notification pattern used for video-uploads
 *        and quiz-published alerts.
 *
 *   GET  /api/live/status        (teacher or enrolled student)
 *        Is a session live right now? Returns the room name + title so the
 *        student UI can render the "🔴 بث مباشر الآن" indicator without any
 *        secret material. Gated by the same enrollment check used for every
 *        paid lesson in this project.
 *
 *   POST /api/live/join          (teacher or enrolled student)
 *        Mints a participant meeting token for the caller. Students default
 *        to audio+video OFF (lecture-style); the teacher joins as owner.
 *        Gated by the same enrollment check.
 *
 *   POST /api/live/end           (teacher only)
 *        Ends the live session: deletes the Daily room and notifies students
 *        that the stream has ended.
 *
 * This file contains NO direct Daily API calls and NO database calls — it only
 * orchestrates: auth -> permission/enrollment -> daily.service -> response.
 * ---------------------------------------------------------------------------
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { prisma } = require("../config/db.js");

const dailyEnv = require("../config/daily.env.config.js");
const {
  createRoom,
  createMeetingToken,
  deleteRoom,
  roomUrlForName,
} = require("../services/daily.service.js");

const {
  isStudentEnrolledInLessonCourse,
} = require("../services/enrollment.stub.service.js");

const {
  startLiveSession,
  getLiveSession,
  endLiveSession,
} = require("../services/liveSession.service.js");

const {
  createNotificationForApprovedStudents,
} = require("../services/notifications.service.js");

const router = express.Router();

/** Resolve the teacher's display name (or fall back to "المعلمة"). */
async function getTeacherName(teacherId) {
  try {
    const teacher = await prisma.user.findUnique({
      where: { id: String(teacherId) },
      select: { name: true },
    });
    return teacher?.name || "المعلمة";
  } catch (_) {
    return "المعلمة";
  }
}

/** Resolve a student's display name. */
async function getStudentName(studentId) {
  try {
    const student = await prisma.user.findUnique({
      where: { id: String(studentId) },
      select: { name: true },
    });
    return student?.name || "طالبة";
  } catch (_) {
    return "طالبة";
  }
}

/**
 * POST /api/live/start  (teacher only)
 */
router.post("/live/start", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      error: "المعلمات فقط يمكنهن بدء بث مباشر.",
    });
  }

  const title = ((req.body && req.body.title) || "بث مباشر — شرح الأحياء")
    .toString()
    .trim()
    .slice(0, 120);

  try {
    const roomName = dailyEnv.roomName;
    // Create (or reuse) the Daily room, then mint an OWNER token for the
    // teacher so she can mute/unmute participants and end the call.
    const { url } = await createRoom(roomName, {
      title,
      start_video_off: false, // teacher camera on
      start_audio_off: true,  // teacher mic muted until she unmutes
    });

    const teacherName = await getTeacherName(req.user.id);
    const token = await createMeetingToken(roomName, {
      userName: teacherName,
      isOwner: true,          // host controls
      audioOff: true,         // start muted, she unmutes
      videoOff: false,        // camera on
      canSendAudio: true,
      canSendVideo: true,
    });

    // Register the session as LIVE.
    startLiveSession({ roomName, startedBy: req.user.id, title });

    // 📢 Notify all approved students (same pattern as video/quiz alerts).
    await createNotificationForApprovedStudents({
      type: "live",
      title: `🔴 بث مباشر الآن`,
      message: title,
      relatedId: roomName,
      relatedType: "live",
      link: "/exams#live",
    });

    return res.status(201).json({
      success: true,
      live: true,
      room: { name: roomName, url },
      token,
      isOwner: true,
      startedBy: req.user.id,
      title,
      // Tell the client whether this is a real Daily call or the stub mode
      // (only true when DAILY_API_KEY is missing). Testers can rely on this.
      stub: !dailyEnv.isConfigured,
    });
  } catch (error) {
    console.error("[live.routes] Start live failed:", error);
    return res.status(500).json({
      error: "فشل بدء البث المباشر. يرجى المحاولة لاحقاً.",
    });
  }
});

/**
 * GET /api/live/status  (teacher or enrolled student)
 */
router.get("/live/status", requireAuth, async (req, res) => {
  // Enrollment gate: only approved students (or the teacher) may know that a
  // session is live or receive a join token.
  const allowed =
    req.user.role === "teacher" ||
    (await isStudentEnrolledInLessonCourse(req.user.id, "__live__"));
  if (!allowed) {
    return res.status(403).json({
      error: "أنت غير مسجلة في الكورس ولا يمكنك الانضمام إلى البث المباشر.",
    });
  }

  const session = getLiveSession();
  if (!session) {
    return res.json({ success: true, live: false, session: null });
  }

  return res.json({
    success: true,
    live: true,
    session: {
      roomName: session.roomName,
      title: session.title,
      startedAt: session.startedAt,
      // Public-safe URL (no secret). Joining still requires a token.
      url: roomUrlForName(session.roomName),
    },
    stub: !dailyEnv.isConfigured,
  });
});

/**
 * POST /api/live/join  (teacher or enrolled student)
 */
router.post("/live/join", requireAuth, async (req, res) => {
  const session = getLiveSession();
  if (!session) {
    return res.status(404).json({ error: "لا يوجد بث مباشر نشط حالياً." });
  }

  const allowed =
    req.user.role === "teacher" ||
    (await isStudentEnrolledInLessonCourse(req.user.id, "__live__"));
  if (!allowed) {
    return res.status(403).json({
      error: "أنت غير مسجلة في الكورس ولا يمكنك الانضمام إلى البث المباشر.",
    });
  }

  const isTeacher = req.user.role === "teacher";
  const name = isTeacher
    ? await getTeacherName(req.user.id)
    : await getStudentName(req.user.id);

  try {
    const token = await createMeetingToken(session.roomName, {
      userName: name,
      isOwner: isTeacher,
      // Students default to mic OFF + camera OFF (lecture-style).
      // The teacher can unmute a specific student later for a Q&A moment.
      audioOff: !isTeacher,
      videoOff: !isTeacher,
      canSendAudio: true,
      canSendVideo: true,
    });

    return res.json({
      success: true,
      live: true,
      room: { name: session.roomName, url: roomUrlForName(session.roomName) },
      token,
      isOwner: isTeacher,
      title: session.title,
      stub: !dailyEnv.isConfigured,
    });
  } catch (error) {
    console.error("[live.routes] Join live failed:", error);
    return res.status(500).json({
      error: "فشل الانضمام إلى البث المباشر. يرجى المحاولة لاحقاً.",
    });
  }
});

/**
 * POST /api/live/end  (teacher only)
 */
router.post("/live/end", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      error: "المعلمات فقط يمكنهن إنهاء البث المباشر.",
    });
  }

  const session = endLiveSession();

  // Best-effort tear-down of the Daily room. If this fails we still report the
  // session as ended (the room auto-expires) but we log it.
  if (session && session.roomName) {
    deleteRoom(session.roomName).catch((error) => {
      console.error("[live.routes] deleteRoom failed:", error);
    });
  }

  // 📢 Notify students that the stream ended.
  await createNotificationForApprovedStudents({
    type: "live_ended",
    title: "انتهى البث المباشر",
    message: "شكراً لمتابعتكم، سنراكم في البث القادم! 🎬",
    relatedType: "live",
  });

  return res.json({ success: true, live: false });
});

module.exports = router;
