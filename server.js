/**
 * server.js
 * ---------------------------------------------------------------------------
 * Minimal Express server to run the platform locally and test the Bunny
 * Stream integration end-to-end:
 *
 *   1. Serves the static frontend (index.html, lesson-view.html, js/, css/).
 *   2. Mounts the video API under /api/lessons (see src/routes/video.routes.js).
 *   3. Provides ONE dev-only helper endpoint to attach a Bunny video ID that
 *      was uploaded manually through the Bunny dashboard to a lesson, so the
 *      playback flow can be tested without going through the upload flow.
 *
 * Run with:   node server.js     (then open http://localhost:3000)
 */

require("dotenv").config();

const path = require("path");
const express = require("express");

const videoRoutes = require("./src/routes/video.routes.js");
const {
  saveLessonVideoId,
} = require("./src/services/lesson.stub.service.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve the static frontend from the project root.
app.use(express.static(path.join(__dirname)));

// Real video API (upload prep + signed playback URLs).
app.use("/api/lessons", videoRoutes);

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
    console.error("[server] Failed to attach video:", error);
    return res.status(500).json({ error: "Failed to attach the video." });
  }
});

app.listen(PORT, () => {
  // Re-attach the seeded Bunny video to lesson-1 on every start (the stub
  // storage is in-memory and would otherwise be empty after a restart).
  const seedVideoId = process.env.LESSON_1_VIDEO_ID;
  if (seedVideoId) {
    saveLessonVideoId("lesson-1", seedVideoId)
      .then(() =>
        console.log(`   Seeded lesson-1 with Bunny video ${seedVideoId}`)
      )
      .catch((err) => console.error("   Seed failed:", err));
  }

  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(
    `   First chapter / first lesson: http://localhost:${PORT}/lesson-view.html?title=مفهوم الدعامة في الكائنات الحية`
  );
});
