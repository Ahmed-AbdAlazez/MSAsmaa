/**
 * live-session.service.js
 * ---------------------------------------------------------------------------
 * Core service for managing live sessions (Zoom & Google Meet) and enforcing
 * SHARED protected token access control for students.
 */

const crypto = require("crypto");
const { prisma } = require("../config/db");
const { isStudentEnrolledInLessonCourse } = require("./enrollment.stub.service");
const { createNotificationForApprovedStudents } = require("./notifications.service");
const { createZoomMeeting } = require("./zoom.service");
const { createGoogleMeetSession } = require("./google-meet.service");

const TOKEN_TTL_MINUTES = 10;

/**
 * Creates a new live session (Zoom or Google Meet) and notifies approved students.
 *
 * @param {object} params
 * @param {string} params.teacherId - Teacher's user ID
 * @param {string} params.title     - Title of the live session
 * @param {string} params.provider  - "zoom" or "google_meet"
 * @param {string} [params.lessonId]- Associated lesson ID (optional)
 * @returns {Promise<object>} Created LiveSession DB record (sanitized)
 */
async function createLiveSession({ teacherId, title, provider, lessonId = null, allowCamera = false }) {
  const normalizedProvider = String(provider || "").toLowerCase().trim();

  if (normalizedProvider !== "zoom" && normalizedProvider !== "google_meet") {
    throw new Error("مزود الخدمة غير صالح. اختر إما Zoom أو Google Meet.");
  }

  const cleanTitle = String(title || "").trim() || "بث مباشر تعليمي";

  let meetingData;
  if (normalizedProvider === "zoom") {
    meetingData = await createZoomMeeting({ title: cleanTitle, allowCamera });
  } else {
    meetingData = await createGoogleMeetSession({ title: cleanTitle });
  }

  // Deactivate any currently active sessions created previously
  await prisma.liveSession.updateMany({
    where: { teacherId, status: "active" },
    data: { status: "ended" },
  });

  // Save real meeting link securely in the database
  const session = await prisma.liveSession.create({
    data: {
      title: cleanTitle,
      provider: normalizedProvider,
      meetingId: meetingData.meetingId,
      meetingUrl: meetingData.meetingUrl,
      passcode: meetingData.passcode || null,
      allowCamera: Boolean(allowCamera),
      status: "active",
      teacherId,
      lessonId: lessonId || null,
    },
  });

  // Send notification to all approved students using platform notification system
  await createNotificationForApprovedStudents({
    type: "live",
    title: "🔴 بث مباشر الآن",
    message: `بدأت أ. أسماء بثاً مباشراً جديداً: ${cleanTitle}`,
    relatedType: "live_session",
    relatedId: session.id,
    link: `/live-session.html?sessionId=${session.id}`,
  });

  return {
    id: session.id,
    title: session.title,
    provider: session.provider,
    status: session.status,
    createdAt: session.createdAt,
  };
}

/**
 * Retrieves the current active live session if any.
 *
 * @returns {Promise<object|null>} Active live session without raw meetingUrl.
 */
async function getActiveLiveSession() {
  const session = await prisma.liveSession.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      provider: true,
      status: true,
      teacherId: true,
      lessonId: true,
      createdAt: true,
    },
  });

  return session;
}

/**
 * Ends an active live session.
 *
 * @param {string} sessionId - ID of session to end
 * @param {string} teacherId - Teacher ID requesting termination
 * @returns {Promise<boolean>} True if session ended
 */
async function endLiveSession(sessionId, teacherId) {
  const result = await prisma.liveSession.updateMany({
    where: { id: sessionId, teacherId, status: "active" },
    data: { status: "ended" },
  });

  return result.count > 0;
}

/**
 * Generates a short-lived single-use access token for an enrolled student.
 * SHARED PROTECTION LOGIC for both Zoom and Google Meet.
 *
 * @param {object} params
 * @param {string} params.studentId - Student user ID
 * @param {string} [params.sessionId]- Optional target session ID (defaults to active session)
 * @returns {Promise<{ token: string, redirectUrl: string, expiresInSeconds: number }>}
 */
async function generateJoinToken({ studentId, sessionId = null }) {
  let session;
  if (sessionId) {
    session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
    });
  } else {
    session = await prisma.liveSession.findFirst({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!session || session.status !== "active") {
    const error = new Error("لا يوجد بث مباشر نشط حالياً.");
    error.statusCode = 404;
    throw error;
  }

  // 1. Backend confirms student is logged in AND enrolled/approved
  const enrolled = await isStudentEnrolledInLessonCourse(studentId, session.lessonId);
  if (!enrolled) {
    const error = new Error("أنت غير مسجل أو غير مفعّل في الكورس للمشاركة في البث المباشر.");
    error.statusCode = 403;
    throw error;
  }

  // 2. Generate a short-lived access token
  const tokenString = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.liveSessionToken.create({
    data: {
      token: tokenString,
      sessionId: session.id,
      studentId,
      expiresAt,
      used: false,
    },
  });

  // 3. Return platform route URL, NOT raw Zoom/Meet link
  return {
    token: tokenString,
    redirectUrl: `/live-session.html?token=${tokenString}`,
    expiresInSeconds: TOKEN_TTL_MINUTES * 60,
  };
}

/**
 * Validates a student's access token and returns embed configuration.
 * SHARED PROTECTION LOGIC for both Zoom and Google Meet.
 *
 * @param {object} params
 * @param {string} params.token     - Short-lived join token
 * @param {string} params.studentId - Authenticated student ID
 * @returns {Promise<object>} Embedded stream information
 */
async function validateTokenAndGetEmbed({ token, studentId }) {
  if (!token) {
    const error = new Error("رمز الدخول غير موجود.");
    error.statusCode = 400;
    throw error;
  }

  const tokenRecord = await prisma.liveSessionToken.findUnique({
    where: { token },
    include: { session: true },
  });

  if (!tokenRecord) {
    const error = new Error("رابط الدخول غير صالح أو غير موجود.");
    error.statusCode = 403;
    throw error;
  }

  if (tokenRecord.studentId !== studentId) {
    const error = new Error("رمز الدخول مخصص لمستخدم آخر.");
    error.statusCode = 403;
    throw error;
  }

  if (new Date() > tokenRecord.expiresAt) {
    const error = new Error("انتهت صلاحية رابط الدخول للبث المباشر.");
    error.statusCode = 403;
    throw error;
  }

  const session = tokenRecord.session;
  if (!session || session.status !== "active") {
    const error = new Error("تم إنهاء هذا البث المباشر.");
    error.statusCode = 410;
    throw error;
  }

  // Double check enrollment access
  const enrolled = await isStudentEnrolledInLessonCourse(studentId, session.lessonId);
  if (!enrolled) {
    const error = new Error("أنت غير مسجل في الكورس المخصص لهذا البث.");
    error.statusCode = 403;
    throw error;
  }

  // Construct iframe embed URL based on provider
  let embedUrl = session.meetingUrl;
  if (session.provider === "zoom") {
    // Zoom web client link for embedded iframe playback
    // If meetingUrl contains /j/MEETING_ID, convert to /wc/join/MEETING_ID
    if (session.meetingId && !embedUrl.includes("/wc/")) {
      embedUrl = `https://zoom.us/wc/join/${session.meetingId}`;
      if (session.passcode) {
        embedUrl += `?pwd=${encodeURIComponent(session.passcode)}`;
      }
    }
  }

  return {
    sessionId: session.id,
    title: session.title,
    provider: session.provider,
    allowCamera: Boolean(session.allowCamera),
    embedUrl,
    passcode: session.passcode || null,
  };
}

module.exports = {
  createLiveSession,
  getActiveLiveSession,
  endLiveSession,
  generateJoinToken,
  validateTokenAndGetEmbed,
};
