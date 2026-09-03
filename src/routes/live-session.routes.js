/**
 * live-session.routes.js
 * ---------------------------------------------------------------------------
 * Express routes for starting, managing, and joining protected live sessions
 * (Zoom & Google Meet).
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const {
  createLiveSession,
  getActiveLiveSession,
  endLiveSession,
  generateJoinToken,
  validateTokenAndGetEmbed,
} = require("../services/live-session.service");

const router = express.Router();

function requireTeacher(req, res, next) {
  if (req.user.role !== "teacher") {
    return res.status(403).json({ error: "المعلمات فقط يمكنهن إدارة البث المباشر." });
  }
  return next();
}

/**
 * POST /api/live/sessions
 * Teacher creates a new live session (Zoom or Google Meet).
 */
router.post("/sessions", requireAuth, requireTeacher, async (req, res) => {
  try {
    const { title, provider, lessonId, allowCamera } = req.body || {};

    if (!provider) {
      return res.status(400).json({ error: "يرجى تحديد مزود الخدمة (Zoom أو Google Meet)." });
    }

    const session = await createLiveSession({
      teacherId: req.user.id,
      title,
      provider,
      lessonId,
      allowCamera: Boolean(allowCamera),
    });

    return res.status(201).json({
      message: "تم بدء البث المباشر بنجاح وتنبيه الطلاب.",
      session,
    });
  } catch (error) {
    console.error("[live-session.routes] Create session error:", error);
    return res.status(error.statusCode || 500).json({
      error: error.message || "فشل بدء البث المباشر. يرجى المحاولة لاحقاً.",
    });
  }
});

/**
 * GET /api/live/active
 * Gets currently active live session if any.
 */
router.get("/active", requireAuth, async (req, res) => {
  try {
    const session = await getActiveLiveSession();
    return res.json({ session: session || null });
  } catch (error) {
    console.error("[live-session.routes] Get active session error:", error);
    return res.status(500).json({ error: "فشل التحقق من وجود بث مباشر." });
  }
});

/**
 * POST /api/live/sessions/:sessionId/end
 * Teacher ends active live session.
 */
router.post("/sessions/:sessionId/end", requireAuth, requireTeacher, async (req, res) => {
  try {
    const success = await endLiveSession(req.params.sessionId, req.user.id);
    if (!success) {
      return res.status(404).json({ error: "البث المباشر غير موجود أو غير نشط." });
    }
    return res.json({ message: "تم إنهاء البث المباشر بنجاح." });
  } catch (error) {
    console.error("[live-session.routes] End session error:", error);
    return res.status(500).json({ error: "فشل إنهاء البث المباشر." });
  }
});

/**
 * POST /api/live/join-token
 * Enrolled student requests single-use short-lived access token for live session.
 */
router.post("/join-token", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const tokenResult = await generateJoinToken({
      studentId: req.user.id,
      sessionId,
    });

    return res.json(tokenResult);
  } catch (error) {
    console.error("[live-session.routes] Join token generation error:", error);
    return res.status(error.statusCode || 500).json({
      error: error.message || "فشل إنشاء رابط الدخول للبث المباشر.",
    });
  }
});

/**
 * GET /api/live/embed-info
 * Validates join token server-side and returns iframe embed information.
 */
router.get("/embed-info", requireAuth, async (req, res) => {
  try {
    const token = req.query.token;
    const embedInfo = await validateTokenAndGetEmbed({
      token,
      studentId: req.user.id,
    });

    return res.json(embedInfo);
  } catch (error) {
    console.error("[live-session.routes] Embed validation error:", error);
    return res.status(error.statusCode || 403).json({
      error: error.message || "رمز الدخول غير صالح أو انتهت صلاحيته.",
    });
  }
});

module.exports = router;
