/**
 * test_quiz_management.js
 * ---------------------------------------------------------------------------
 * HTTP regression for TEACHER exam management:
 *   - GET  /api/quizzes-managed                list + canEdit flag
 *   - GET  /api/quizzes/:quizId/full           full questions view
 *   - PUT  /api/quizzes/:quizId                edit settings BEFORE start only
 *         (title / lesson / window / duration / question count)
 *   - DELETE /api/quizzes/:quizId              ALWAYS allowed (before, during
 *         or after the window)
 *
 * Run: node src/scripts/test_quiz_management.js
 */
require("dotenv").config();

// Storage stubs MUST be installed before app require (same rule as the
// main workflow suite).
const storageService = require("../services/supabaseStorage.service.js");
storageService.uploadQuizImage = async (b, m, q) => `quizzes/${q}/x.png`;
storageService.getQuizImageSignedUrl = async (f) => `https://signed.test/${f}`;

const setStudentNameForTesting = require("../services/quiz.stub.service.js").setStudentNameForTesting;
setStudentNameForTesting("student-a", "سارة أحمد");

const app = require("../../app");
const jwt = require("jsonwebtoken");

let passCount = 0;
let failCount = 0;
function check(label, cond, detail = "") {
  if (cond) {
    passCount += 1;
    console.log(`   \u2713 ${label}`);
  } else {
    failCount += 1;
    console.log(`   \u2717 ${label} ${detail ? `- ${detail}` : ""}`);
  }
}
function section(title) {
  console.log(`\n=== ${title} ===`);
}

const SECRET = process.env.JWT_SECRET || "dev-secret";
const teacherToken = jwt.sign({ id: "teacher-x", role: "teacher" }, SECRET);
const otherTeacherToken = jwt.sign({ id: "teacher-y", role: "teacher" }, SECRET);
const studentToken = jwt.sign({ id: "student-a", role: "student" }, SECRET);

const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  }).catch((err) => {
    if (err && err.name === "TimeoutError") {
      return { status: 0, json: async () => ({}) };
    }
    throw err;
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

let server;
let baseUrl;

(async () => {
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://localhost:${server.address().port}`;

  /* ================================================================
   * TEST 1 — future quiz: settings editable, wrong inputs rejected
   * ================================================================ */
  section("TEST 1: edit ALL settings before start");
  const created = await req("POST", "/api/quizzes", {
    token: teacherToken,
    body: {
      lessonId: "lesson-quiz-test",
      courseId: "course-mgmt-test",
      title: "اختبار قابل للتعديل",
      questionCount: 1,
      startTime: iso(10 * 60_000),
      endTime: iso(70 * 60_000),
      durationMinutes: 30,
    },
  });
  check("create future quiz -> 201", created.status === 201);
  const quizId = created.data.quiz.id;

  const qAdded = await req("POST", `/api/quizzes/${quizId}/questions`, {
    token: teacherToken,
    body: {
      type: "mcq",
      text: "سؤال ثابت",
      choices: ["أ", "ب", "ج", "د"],
      correctIndex: 1,
    },
  });
  check(
    "add one MCQ -> 201",
    qAdded.status === 201,
    `status: ${qAdded.status}, data: ${JSON.stringify(qAdded.data)}`
  );

  const listed = await req("GET", "/api/quizzes-managed", { token: teacherToken });
  const mine = (listed.data.quizzes || []).find((q) => q.id === quizId);
  check(
    "list shows quiz as editable",
    listed.status === 200 && Boolean(mine) && mine.canEdit === true
  );

  const edited = await req("PUT", `/api/quizzes/${quizId}`, {
    token: teacherToken,
    body: {
      title: "عنوان معدّل",
      lessonId: "lesson-2",
      startTime: iso(5 * 60_000),
      endTime: iso(80 * 60_000),
      durationMinutes: 25,
    },
  });
  check(
    "PUT settings before start -> 200",
    edited.status === 200 &&
      edited.data.quiz &&
      edited.data.quiz.title === "عنوان معدّل" &&
      edited.data.quiz.lessonId === "lesson-2" &&
      edited.data.quiz.durationMinutes === 25,
    JSON.stringify(edited.data)
  );

  const full = await req("GET", `/api/quizzes/${quizId}/full`, { token: teacherToken });
  check(
    "changes visible in full view; question intact",
    full.status === 200 &&
      full.data.quiz.title === "عنوان معدّل" &&
      Math.abs(Date.parse(full.data.quiz.endTime) - Date.parse(iso(80 * 60_000))) < 5000 &&
      full.data.questions.length === 1,
    `status: ${full.status}, questions: ${full.data && full.data.questions ? full.data.questions.length : "none"}, title: ${full.data && full.data.quiz ? full.data.quiz.title : "?"}`
  );

  const badWindow = await req("PUT", `/api/quizzes/${quizId}`, {
    token: teacherToken,
    body: { startTime: iso(30 * 60_000), endTime: iso(10 * 60_000) },
  });
  check("end before start -> 400", badWindow.status === 400);

  const lowCount = await req("PUT", `/api/quizzes/${quizId}`, {
    token: teacherToken,
    body: { questionCount: 0 },
  });
  check(
    "questionCount below existing questions -> 400",
    lowCount.status === 400,
    JSON.stringify(lowCount.data)
  );

  const raiseCount = await req("PUT", `/api/quizzes/${quizId}`, {
    token: teacherToken,
    body: { questionCount: 3 },
  });
  check("raising declared count -> 200", raiseCount.status === 200);

  /* ================================================================
   * TEST 2 — gates: students & OTHER teachers cannot edit
   * ================================================================ */
  section("TEST 2: authorization gates");
  const studentPut = await req("PUT", `/api/quizzes/${quizId}`, {
    token: studentToken,
    body: { title: "اختراق" },
  });
  check("student PUT settings -> 403", studentPut.status === 403);

  const strangerPut = await req("PUT", `/api/quizzes/${quizId}`, {
    token: otherTeacherToken,
    body: { title: "معلم آخر" },
  });
  check("other teacher's PUT -> 404 (ownership)", strangerPut.status === 404);

  const studentDelete = await req("DELETE", `/api/quizzes/${quizId}`, {
    token: studentToken,
  });
  check("student DELETE -> 403", studentDelete.status === 403);

  /* ================================================================
   * TEST 3 — started quiz: settings LOCKED, delete STILL works
   * ================================================================ */
  section("TEST 3: after start — no edits, delete anytime");
  const startedQuiz = await req("POST", "/api/quizzes", {
    token: teacherToken,
    body: {
      lessonId: "lesson-quiz-test",
      courseId: "course-mgmt-test",
      title: "اختبار بدأ بالفعل",
      questionCount: 1,
      startTime: iso(-1500),
      endTime: iso(60 * 60_000),
      durationMinutes: 60,
    },
  });
  const startedId = startedQuiz.data.quiz.id;
  await sleep(1600); // cross the start line

  const lateEdit = await req("PUT", `/api/quizzes/${startedId}`, {
    token: teacherToken,
    body: { title: "محاولة متأخرة" },
  });
  check(
    "PUT settings AFTER start -> 403",
    lateEdit.status === 403,
    JSON.stringify(lateEdit.data)
  );

  const lateQuestionDelete = await req(
    "GET",
    `/api/quizzes/${startedId}/full`,
    { token: teacherToken }
  );
  check("started quiz still VIEWABLE in full", lateQuestionDelete.status === 200);

  const deletedAnytime = await req("DELETE", `/api/quizzes/${startedId}`, {
    token: teacherToken,
  });
  check("DELETE after start -> 200 (anytime rule)", deletedAnytime.status === 200);

  const goneFull = await req("GET", `/api/quizzes/${startedId}/full`, {
    token: teacherToken,
  });
  check("deleted quiz full-view -> 404", goneFull.status === 404);

  const deletedAgain = await req("DELETE", `/api/quizzes/${startedId}`, {
    token: teacherToken,
  });
  check("second DELETE -> 404", deletedAgain.status === 404);

  /* ---- cleanup: remove the editable fixture too -------------------- */
  await req("DELETE", `/api/quizzes/${quizId}`, { token: teacherToken });

  console.log(`\n=== RESULT: ${passCount} passed, ${failCount} failed ===`);
  server.close();
  process.exit(failCount === 0 ? 0 : 1);
})().catch((error) => {
  console.error("[test_quiz_management] fatal:", error);
  if (server) server.close();
  process.exit(1);
});
