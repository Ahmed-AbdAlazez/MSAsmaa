process.env.PORT = "3211";
const app = require("../app.js");
const jwt = require("jsonwebtoken");

const token = jwt.sign({ id: "teacher-t1", role: "TEACHER" }, process.env.JWT_SECRET, { expiresIn: "2h" });
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const baseBody = {
  title: "اختبار الترميز",
  courseId: "biology",
  lessonId: "lesson-1",
  startTime: new Date(Date.now() + 60e3).toISOString(),
  endTime: new Date(Date.now() + 3600e3).toISOString(),
  durationMinutes: 10,
};

app.listen(3211, async () => {
  const url = "http://localhost:3211/api/quizzes";
  for (const [label, body] of [
    ["no questions field", baseBody],
    ["questions: []", { ...baseBody, questions: [] }],
  ]) {
    const r = await fetch(url, { method: "POST", headers: auth, body: JSON.stringify(body) });
    const t = await r.text();
    console.log(label, "->", r.status, t.slice(0, 120));
  }
  process.exit(0);
});
