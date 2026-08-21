/**
 * server.js
 * ---------------------------------------------------------------------------
 * Local development entry point. Runs the Express app (app.js) on port 3000.
 *
 * On Vercel this file is NOT used — production runs api/index.js instead.
 *
 * Run with:   node server.js     (then open http://localhost:3000)
 */

const app = require("./app.js");
const {
  saveLessonVideoId,
} = require("./src/services/lesson.stub.service.js");

const PORT = process.env.PORT || 3000;

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
