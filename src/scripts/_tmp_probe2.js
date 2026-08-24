process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL;
// Patch storage like the suite does BEFORE requiring app
const storageService = require("C:/Users/moham/OneDrive/Desktop/MSAsmaa/src/services/supabaseStorage.service.js");
storageService.uploadQuizImage = async (buffer, mimeType, quizId) =>
  `quizzes/${quizId}/test-image.${mimeType === "image/png" ? "png" : "jpg"}`;
storageService.getQuizImageSignedUrl = async (filePath) =>
  `https://signed.test/${filePath}?token=fake`;

const jwt = require("jsonwebtoken");
const app = require("C:/Users/moham/OneDrive/Desktop/MSAsmaa/app.js");

async function main() {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const t = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const teacher = t("probe-teacher", "TEACHER");
  const studentA = t("student-a", "STUDENT");
  const H = (token) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

  const created = await fetch(`${base}/api/quizzes`, {
    method: "POST", headers: H(teacher),
    body: JSON.stringify({
      title: "بروب كامل", lessonId: "lesson-quiz-test", courseId: "probe-course",
      questionCount: 3, durationMinutes: 60,
      startTime: new Date(Date.now() - 60e3).toISOString(),
      endTime: new Date(Date.now() + 36e5).toISOString(),
    }),
  });
  const quizId = (await created.json()).quiz.id;
  console.log("quiz:", quizId);

  const qs = [
    { type: "mcq", text: "١+١؟", choices: ["١","٢","٣","٤"], correctIndex: 1 },
    { type: "written", text: "عرّف الخلية.", modelAnswer: "الميتوكوندريا" },
  ];
  for (const q of qs) {
    const r = await fetch(`${base}/api/quizzes/${quizId}/questions`, {
      method: "POST", headers: H(teacher), body: JSON.stringify(q),
    });
    console.log("add:", r.status);
  }
  // image question via multipart like suite? check how suite uploads...
  const over = await fetch(`${base}/api/quizzes/${quizId}/questions`, {
    method: "POST", headers: H(teacher),
    body: JSON.stringify({ type: "written", text: "زيادة", modelAnswer: "x" }),
  });
  console.log("overLimit:", over.status);

  const tq = await fetch(`${base}/api/quizzes/${quizId}/questions`, { headers: H(teacher) });
  console.log("read-back count:", (await tq.json()).questions.length);

  const start = await fetch(`${base}/api/quizzes/${quizId}/start`, {
    method: "POST", headers: H(studentA), body: "{}",
  });
  console.log("start status:", start.status);
  console.log("start body:", JSON.stringify(await start.json()).slice(0, 500));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
