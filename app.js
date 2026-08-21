/**
 * app.js
 * ---------------------------------------------------------------------------
 * The Express application (routes + middleware), WITHOUT app.listen().
 *
 * Splitting the app from the server lets the same code run in two places:
 *   - server.js      -> local development (node server.js, port 3000)
 *   - api/index.js   -> Vercel serverless function (production)
 *
 * Endpoints:
 *   POST /api/auth/login                      hardcoded dev accounts
 *   POST /api/lessons/:lessonId/video         teacher upload prep (Bunny)
 *   GET  /api/lessons/:lessonId/video-url     signed playback URL
 *   POST /api/dev/lessons/:lessonId/video-id  dev helper to attach a video ID
 */

require("dotenv").config();

const path = require("path");
const express = require("express");

const videoRoutes = require("./src/routes/video.routes.js");
const {
  saveLessonVideoId,
} = require("./src/services/lesson.stub.service.js");

const app = express();

app.use(express.json());

// CORS (dev): allow the frontend when it is opened from a different origin
// (VS Code Live Server, file://) while the API runs elsewhere.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-user-id, x-user-role"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Serve the static frontend from the project root (local dev only;
// on Vercel the platform serves static files itself).
app.use(express.static(path.join(__dirname)));

// Real video API (upload prep + signed playback URLs).
app.use("/api/lessons", videoRoutes);

// Teacher-only video management (edit metadata / delete).
app.use("/api/videos", require("./src/routes/video-manage.routes.js"));

/* ==========================================================================
 * DEV TEST ACCOUNTS (hardcoded for platform testing only — replace with a
 * real database + hashed passwords later).
 *
 *   Student:  student@gmail.com  /  Student@123
 *   Teacher:  teacher@gmail.com  /  Teacher@123
 * ========================================================================== */
const DEV_ACCOUNTS = [
  {
    id: "student-1",
    email: "student@gmail.com",
    password: "Student@123",
    name: "طالب تجريبي",
    role: "student",
  },
  {
    id: "teacher-1",
    email: "teacher@gmail.com",
    password: "Teacher@123",
    name: "أ. أسماء مرسال",
    role: "teacher",
  },
];

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns the user profile when the credentials match one of the hardcoded
 * dev accounts, otherwise 401.
 */
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const account = DEV_ACCOUNTS.find(
    (a) => a.email === String(email).trim().toLowerCase() && a.password === password
  );

  if (!account) {
    return res.status(401).json({
      error: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    });
  }

  return res.json({
    id: account.id,
    name: account.name,
    role: account.role,
    email: account.email,
  });
});

/**
 * DEV ONLY — attach an existing Bunny video ID to a lesson.
 *
 * Use this when the video was already uploaded via the Bunny dashboard
 * (so you already have its Video ID / GUID) and you just want to watch it
 * on the platform.
 *
 *   curl -X POST http://localhost:3000/api/dev/lessons/lesson-1/video-id \
 *        -H "Content-Type: application/json" \
 *        -d '{"videoId": "YOUR-BUNNY-VIDEO-GUID"}'
 */
app.post("/api/dev/lessons/:lessonId/video-id", async (req, res) => {
  const { lessonId } = req.params;
  const { videoId } = req.body || {};

  if (!videoId || typeof videoId !== "string" || !videoId.trim()) {
    return res.status(400).json({ error: "videoId is required." });
  }

  try {
    await saveLessonVideoId(lessonId, videoId.trim());
    return res.json({
      message: `Bunny video ${videoId.trim()} attached to lesson ${lessonId}.`,
      lessonId,
      videoId: videoId.trim(),
    });
  } catch (error) {
    console.error("[app] Failed to attach video:", error);
    return res.status(500).json({ error: "Failed to attach the video." });
  }
});

/* ==========================================================================
 * Adham's auth backend (merged from feat/user-auth-and-registration):
 * JWT signup/login + registration requests, backed by Prisma/PostgreSQL.
 *
 * Mounted AFTER the dev login above, so:
 *   - POST /api/auth/login        -> dev accounts above (frontend today)
 *   - POST /api/v1/auth/login     -> REAL JWT auth (Prisma users)
 *   - everything else under /api/v1/auth & /api/v1/registration-requests
 * Switching the frontend to the real endpoints retires the dev block.
 * ========================================================================== */
const apiRoutes = require("./src/routes/index.js");
app.use("/api", apiRoutes);

// Adham's centralized error handlers (JSON 404 for unknown API paths +
// formatted error responses). Mounted last on purpose.
const { notFound, errorHandler } = require("./src/middlewares/errorMiddleware.js");
app.use(notFound);
app.use(errorHandler);

module.exports = app;
