/**
 * test_quiz_persistence.js
 * ---------------------------------------------------------------------------
 * PROOF that quiz data now survives process boundaries (the exact failure
 * mode of the old in-memory stub on Vercel serverless, where consecutive
 * requests hit different instances):
 *
 *   1. A CHILD node process (its own app instance + Prisma pool) creates a
 *      quiz in the real Neon database.
 *   2. THIS parent process (a different instance) fetches the Exams Hub
 *      feed and must see the child's quiz with every field intact.
 *   3. The feed is fetched FIVE times in a row (simulating five page
 *      reloads) and must return an identical list every time.
 *   4. Questions persisted by the child round-trip correctly.
 *
 * Run: node src/scripts/test_quiz_persistence.js
 * ---------------------------------------------------------------------------
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const { spawnSync } = require("child_process");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = require("../../app.js");

let passed = 0;
let failed = 0;
function check(name, condition, extra) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${name}${extra ? ` -> ${extra}` : ""}`);
  }
}

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const teacherToken = jwt.sign(
    { id: "teacher-persistence", role: "TEACHER" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const title = `اختبار الاستمرارية ${Date.now()}`;
  const startMs = Date.now() - 60e3;
  const endMs = Date.now() + 36e5;

  // ---- step 1: child process creates the quiz --------------------------
  const childPath = path.join(__dirname, "persistence_child.js");
  const child = spawnSync(
    process.execPath,
    [childPath, title, String(startMs), String(endMs)],
    { encoding: "utf8", timeout: 60000 }
  );
  const resultLine = (child.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("CHILD_RESULT "));
  let childResult = null;
  try {
    childResult = JSON.parse(resultLine.replace("CHILD_RESULT ", ""));
  } catch (_) {
    /* handled below */
  }
  check(
    "child instance created a quiz in the real DB",
    child.status === 0 && childResult && childResult.quizId,
    `exit=${child.status} out=${String(child.stdout).slice(-200)} err=${String(child.stderr).slice(-300)}`
  );
  const quizId = childResult && childResult.quizId;

  // ---- steps 2+3: parent instance sees it; five reloads identical ------
  const getFeed = async () => {
    const res = await fetch(`${base}/api/quizzes/available`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const first = await getFeed();
  const mine =
    first.status === 200
      ? first.body.exams.find((exam) => exam.id === quizId)
      : null;
  check(
    "DIFFERENT instance sees the child's quiz",
    Boolean(mine),
    `feed status=${first.status}, exams=${first.body ? first.body.exams.length : "?"}`
  );
  check(
    "persisted fields survive the round-trip",
    mine &&
      mine.title === title &&
      mine.lessonId === "lesson-1" &&
      mine.courseId === "persistence-proof" &&
      mine.questionCount === 2 &&
      mine.durationMinutes === 30 &&
      Math.abs(Date.parse(mine.startTime) - startMs) < 1500 &&
      mine.status === "active",
    JSON.stringify(mine)
  );

  let identical = true;
  let lastSnapshot = "";
  for (let i = 1; i <= 5; i++) {
    const reload = await getFeed();
    const snapshot = JSON.stringify(reload.body ? reload.body.exams : null);
    if (reload.status !== 200) identical = false;
    if (i > 1 && snapshot !== lastSnapshot) identical = false;
    lastSnapshot = snapshot;
  }
  check("five consecutive reloads return the SAME complete list", identical);

  // ---- step 4: questions persisted by the child ------------------------
  if (quizId) {
    const qRes = await fetch(`${base}/api/quizzes/${quizId}/questions`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const qBody = await qRes.json().catch(() => null);
    const questions = (qBody && qBody.questions) || [];
    check(
      "questions persisted with choices + model answer intact",
      qRes.ok &&
        questions.length === 2 &&
        questions[0].type === "mcq" &&
        questions[0].choices.length === 4 &&
        questions[0].correctChoiceId === "c2" &&
        questions[1].type === "written" &&
        questions[1].modelAnswer === "نموذج",
      JSON.stringify(questions).slice(0, 220)
    );
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("[test_quiz_persistence] fatal:", error);
  process.exit(1);
});
