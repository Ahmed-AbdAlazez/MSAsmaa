/**
 * persistence_child.js - spawned by test_quiz_persistence.js.
 * Runs in ITS OWN node process (its own Prisma pool / app instance),
 * creates one quiz in the real Neon database, prints its id as the
 * LAST line of stdout, then exits.
 *
 * Usage: node persistence_child.js "<title>" <startTimeMs> <endTimeMs>
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const jwt = require("jsonwebtoken");
const app = require("../../app.js");

async function main() {
  const [title, startMs, endMs] = process.argv.slice(2);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign(
    { id: "teacher-persistence", role: "TEACHER" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const res = await fetch(`${base}/api/quizzes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      lessonId: "lesson-1",
      courseId: "persistence-proof",
      questionCount: 2,
      durationMinutes: 30,
      startTime: new Date(Number(startMs)).toISOString(),
      endTime: new Date(Number(endMs)).toISOString(),
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.quiz) {
    console.error("[child] create failed:", res.status);
    process.exit(1);
  }
  // Questions are added via their own endpoint (the create call makes
  // only the quiz shell).
  for (const question of [
    {
      type: "mcq",
      text: "خلية الطاقة؟",
      choices: ["النواة", "الميتوكوندريا", "الكلوروبلاست", "الرايبوسوم"],
      correctIndex: 1,
    },
    { type: "written", text: "عرّف التنفس الخلوي.", modelAnswer: "نموذج" },
  ]) {
    const qRes = await fetch(`${base}/api/quizzes/${body.quiz.id}/questions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(question),
    });
    if (!qRes.ok) {
      console.error("[child] add-question failed:", qRes.status);
      process.exit(1);
    }
  }
  console.log("CHILD_RESULT " + JSON.stringify({ status: res.status, quizId: body.quiz.id }));
  process.exit(0);
}

main().catch((error) => {
  console.error("[child] fatal:", error.message);
  process.exit(1);
});
