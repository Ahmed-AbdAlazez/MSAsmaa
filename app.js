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
 *   POST /api/lessons/:lessonId/video         teacher upload prep (Bunny)
 *   GET  /api/lessons/:lessonId/video-url     signed playback URL
 */

require("dotenv").config();

const express = require("express");

const videoRoutes = require("./src/routes/video.routes.js");
const materialsRoutes = require("./src/routes/materials.routes.js");

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
    "Content-Type, x-user-id, x-user-role",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
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

// PDF lesson materials API (private Google Drive storage + backend streaming).
app.use("/api", materialsRoutes);

const notificationsRoutes = require("./src/routes/notifications.routes.js");
app.use("/api", notificationsRoutes);

// Quiz feature (teacher creation + student taking + leaderboards + review).
// See src/routes/quizzes/quiz.routes.js for the full endpoint list and
// QUIZ_README.md for flows, stubs, and testing.
app.use("/api", require("./src/routes/quizzes/quiz.routes.js"));

// Lesson notes (teacher).
app.use("/api", require("./src/routes/lessonNotesComments.routes.js"));

/* ==========================================================================
 * Auth backend (JWT signup/login + registration requests, Prisma/PostgreSQL).
 *
 *   - POST /api/v1/auth/login     -> JWT auth (Prisma users)
 *   - everything else under /api/v1/auth & /api/v1/registration-requests
 * ========================================================================== */
const apiRoutes = require("./src/routes/index.js");
app.use("/api", apiRoutes);

// Adham's centralized error handlers (JSON 404 for unknown API paths +
// formatted error responses). Mounted last on purpose.
const {
  notFound,
  errorHandler,
} = require("./src/middlewares/errorMiddleware.js");
app.use(notFound);
app.use(errorHandler);

module.exports = app;
