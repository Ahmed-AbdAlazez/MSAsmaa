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
 *   POST /api/auth/login                      hardcoded code+password accounts
 *   POST /api/lessons/:lessonId/video         teacher upload prep (Bunny)
 *   GET  /api/lessons/:lessonId/video-url     signed playback URL
 *   POST /api/dev/lessons/:lessonId/video-id  dev helper to attach a video ID
 */

require("dotenv").config();

const express = require("express");

const videoRoutes = require("./src/routes/video.routes.js");
const materialsRoutes = require("./src/routes/materials.routes.js");
const {
  saveLessonVideoId,
} = require("./src/services/lesson.stub.service.js");

const app = express();

app.use(express.json());

// Global UTF-8 guarantee for API responses.
// Express already defaults res.json() to "application/json; charset=utf-8",
// but this makes it explicit and immune to any route setting a bare
// Content-Type later (garbled-Arabic defense in depth).
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function patchedJson(body) {
    if (!res.headersSent) {
      res.set("Content-Type", "application/json; charset=utf-8");
    }
    return originalJson(body);
  };
  next();
});

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

// Pure API server: no static file serving. The frontend is served by the
// Vite dev server in development (which proxies /api here) and by `vite
// preview` / static hosting (Vercel) in production.

// Real video API (upload prep + signed playback URLs).
app.use("/api/lessons", videoRoutes);

// Teacher-only video management (edit metadata / delete).
app.use("/api/videos", require("./src/routes/video-manage.routes.js"));

// Lesson PDF materials stored on Supabase Storage:
//   POST /api/lessons/:lessonId/materials          (teacher uploads a PDF)
//   GET  /api/lessons/:lessonId/materials          (list for the lesson page)
//   GET  /api/materials/:materialId/download       (signed, enrollment-gated)
app.use("/api", require("./src/routes/materials.routes.js"));

// PDF lesson materials API (teacher upload + enrolled student download).
app.use("/api", materialsRoutes);

const notificationsRoutes = require("./src/routes/notifications.routes.js");
app.use("/api", notificationsRoutes);

// Quiz feature (teacher creation + student taking + leaderboards + review).
// See src/routes/quizzes/quiz.routes.js for the full endpoint list and
// QUIZ_README.md for flows, stubs, and testing.
app.use("/api", require("./src/routes/quizzes/quiz.routes.js"));

/* ==========================================================================
 * DEV TEST ACCOUNTS (hardcoded for platform testing only — replace with a
 * real database + hashed passwords later).
 *
 * Login is now CODE + PASSWORD (no emails):
 *   Student 1 (Enrolled):  STU-2026-01   /  Stu@2026
 *   Student 2 (Not Enrolled): STU-2026-02 /  Stu@2026
 *   Teacher:  TCH-2026-01   /  Tea@2026
 * ========================================================================== */
const DEV_ACCOUNTS = [
  {
    id: "student-1",
    code: "STU-2026-01",
    password: "Stu@2026",
    name: "أحمد محمد",
    role: "student",
  },
  {
    id: "student-2",
    code: "STU-2026-02",
    password: "Stu@2026",
    name: "طالب غير مسجل",
    role: "student",
  },
  {
    id: "teacher-1",
    code: "TCH-2026-01",
    password: "Tea@2026",
    name: "أ. أسماء مرسال",
    role: "teacher",
  },
];

/**
 * POST /api/auth/login
 * Body: { code, password }   ("email" is still accepted as a fallback key
 * for older clients, but it must contain the login CODE)
 * Returns the user profile when the credentials match one of the hardcoded
 * dev accounts, otherwise 401.
 */
app.post("/api/auth/login", (req, res) => {
  const { code, email, password } = req.body || {};

  // Accept either body key, normalize to the canonical CODE format.
  const identifier = String(code || email || "").trim().toUpperCase();

  if (!identifier || !password) {
    return res.status(400).json({ error: "كود الدخول وكلمة المرور مطلوبان." });
  }

  const account = DEV_ACCOUNTS.find(
    (a) => a.code === identifier && a.password === password
  );

  if (!account) {
    return res.status(401).json({
      error: "كود الدخول أو كلمة المرور غير صحيحة.",
    });
  }

  return res.json({
    id: account.id,
    name: account.name,
    role: account.role,
    code: account.code,
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
