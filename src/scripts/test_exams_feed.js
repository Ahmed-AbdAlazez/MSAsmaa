/**
 * test_exams_feed.js
 * ---------------------------------------------------------------------------
 * Regression for the Exams Hub feed authorization bug:
 *
 *   GET /api/quizzes/available must answer 200 for BOTH students AND
 *   teachers (teachers preview the hub exactly as students see it), and
 *   401 for anonymous callers.
 *
 * Previously the route was requireStudent-gated, so a logged-in teacher
 * opening exams.html got 403 and the page showed the misleading
 * "confirm you are logged in" message.
 *
 * Run: node src/scripts/test_exams_feed.js
 * ---------------------------------------------------------------------------
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const jwt = require("jsonwebtoken");

const app = require("../../app.js");

const tokenFor = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1h" });

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

  const teacherToken = tokenFor("teacher-hub", "TEACHER");
  const studentToken = tokenFor("student-hub", "STUDENT");

  try {
    const created = await fetch(`${base}/api/quizzes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "اختبار تغذية الراجعة للـ Hub",
        lessonId: "lesson-1",
        courseId: "biology",
        questionCount: 1,
        durationMinutes: 15,
        startTime: new Date(Date.now() - 3600e3).toISOString(),
        endTime: new Date(Date.now() + 3600e3).toISOString(),
      }),
    });
    const createdBody = await created.json().catch(() => null);
    const quizId = createdBody && createdBody.quiz && createdBody.quiz.id;
    check("teacher can create a quiz", created.ok && Boolean(quizId),
      `${created.status} ${JSON.stringify(createdBody).slice(0, 120)}`);

    const getJson = async (token) => {
      const res = await fetch(`${base}/api/quizzes/available`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return { status: res.status, ok: res.ok, body: await res.json().catch(() => null) };
    };

    const teacherRes = await getJson(teacherToken);
    check("GET /available as TEACHER -> 200", teacherRes.status === 200,
      `got ${teacherRes.status}: ${JSON.stringify(teacherRes.body).slice(0, 120)}`);

    const studentRes = await getJson(studentToken);
    check("GET /available as STUDENT -> 200", studentRes.status === 200,
      `got ${studentRes.status}`);

    const anonRes = await getJson(null);
    check("GET /available anonymous -> 401", anonRes.status === 401,
      `got ${anonRes.status}`);

    const exams = teacherRes.body.exams || [];
    const mine = exams.find((exam) => exam.id === quizId);
    check("feed includes the created quiz", Boolean(mine));
    check(
      "server-computed status present (active)",
      mine && mine.status === "active",
      mine ? `status=${mine.status}` : "quiz missing"
    );
    check(
      "payload exposes timing metadata",
      mine && typeof mine.startTime === "string" &&
        typeof mine.durationMinutes === "number"
    );
  } catch (error) {
    console.error("[test_exams_feed] error:", error);
  } finally {
    // Self-cleanup: this script publishes into the REAL "biology" course;
    // delete its row so repeated runs never pollute the live exams feed.
    try {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      await prisma.quiz.deleteMany({
        where: { courseId: "biology", title: "اختبار تغذية الراجعة للـ Hub", lessonId: "lesson-1" },
      });
      await prisma.$disconnect();
    } catch (_) {
      /* best-effort */
    }
  }
  // NOTE: intentionally no server.close() — closing mid-teardown trips a
  // libuv assertion on Windows (same pattern as test_quiz_workflow.js).

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  // Give keep-alive sockets / lazy handles a beat so forced exit never
  // trips the libuv teardown assertion on Windows.
  await new Promise((resolve) => setTimeout(resolve, 400));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("[test_exams_feed] fatal:", error);
  process.exit(1);
});
