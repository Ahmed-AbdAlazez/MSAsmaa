/**
 * test_quiz_workflow.js
 * ---------------------------------------------------------------------------
 * End-to-end verification of the ENTIRE quiz feature, in the same style as
 * src/scripts/test_workflow.js: boots the real Express app on an ephemeral
 * port and talks to it over HTTP.
 *
 * Covers (numbers match QUIZ_README.md "How to test"):
 *   1  create quiz mixing MCQ + written + one image question
 *   2  student starts & completes inside the window
 *   3  auto-submit when PERSONAL countdown hits zero
 *   4  auto-submit when OVERALL end_time hits first (own case!)
 *   5  immediate score reflects MCQ only
 *   5b hub attempt-state feed (GET /quizzes/my-attempts): submitted entry
 *      with score + zero remaining attempts, no per-question leaks
 *   6  leaderboard hidden until end_time
 *   7  direct review call before end_time rejected
 *   8  review after end_time: MCQ red/green data, written side-by-side
 *   9  granted retry keeps BOTH results; leaderboard uses the better
 *   10 resume: reopen restores answers + REDUCED timer; late reopen
 *      auto-submits instead
 *
 * Run:  node src/scripts/test_quiz_workflow.js
 *
 * NOTE: Supabase Storage calls are stubbed below (pure network isolation);
 * everything else — routing, timing, grading, gating — is the REAL code.
 */

require("dotenv").config();

/* ------------------------------------------------------------------ *
 * Network isolation: patch Supabase Storage BEFORE requiring app.js.
 * The route files destructure these functions at require-time, so the
 * patches must be in place first. Everything else runs for real.
 * ------------------------------------------------------------------ */
const storageService = require("../services/supabaseStorage.service.js");
storageService.uploadQuizImage = async (buffer, mimeType, quizId) =>
  `quizzes/${quizId}/test-image.${mimeType === "image/png" ? "png" : "jpg"}`;
storageService.getQuizImageSignedUrl = async (filePath) =>
  `https://signed.test/${filePath}?token=fake`;

// Quiz publication normally notifies every approved student. This suite
// replaces that publisher before app.js is loaded so QA never sends dummy
// notifications to real users.
const notificationService = require("../services/notifications.service.js");
const testNotifications = [];
notificationService.createNotificationForApprovedStudents = async (notice) => {
  testNotifications.push(notice);
  return { count: 0 };
};

/* Seed fake display names + course roster (test-only overlay helpers).
   COURSE is unique per run: quiz rows now PERSIST in Neon, so a fixed
   courseId would let previous runs' released quizzes inflate the exact
   cumulative-total assertions below. */
const COURSE = `course-bio-suite-${Date.now()}`;
const {
  setStudentNameForTesting,
  setCourseRosterForTesting,
} = require("../services/quiz.stub.service.js");
const { prisma } = require("../config/db.js");
const crypto = require("crypto");
const QA_USERS = {
  studentA: crypto.randomUUID(),
  studentB: crypto.randomUUID(),
  studentC: crypto.randomUUID(),
  studentZ: crypto.randomUUID(),
};

// NOTE: the REAL Express app lives in the project ROOT (app.js) — that is
// what server.js and api/index.js run. There is an older duplicate copy at
// src/app.js which does NOT have the quiz routes mounted, so we reach past
// it explicitly.
const app = require("../../app");
const jwt = require("jsonwebtoken");

let server;
let baseUrl;

/** Tiny HTTP helper around fetch with optional Bearer token. */
async function req(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined),
    // A stalled DB/dev-stack must fail the CHECK, not hang the whole suite.
    signal: AbortSignal.timeout(20_000),
  }).catch((err) => {
    if (err && err.name === "TimeoutError") {
      console.log(`   [net] ${method} ${path} timed out after 20s`);
      return { status: 0, json: async () => ({}) };
    }
    throw err;
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* non-JSON body tolerated */
  }
  return { status: res.status, data };
}

/** Multipart builder for the image question (Node 18+ FormData/Blob). */
function imageQuestionForm(question) {
  const form = new FormData();
  form.append("type", question.type);
  form.append("text", question.text);
  question.choices.forEach((choice, index) =>
    form.append(`choice${index + 1}`, choice)
  );
  form.append("correctIndex", String(question.correctIndex));
  form.append(
    "image",
    new Blob([Buffer.from("fake-png-bytes")], { type: "image/png" }),
    "diagram.png"
  );
  return form;
}

/* ------------------------------------------------------------------ *
 * Assertion plumbing — collects results, prints ✓/✗, fails loudly.
 * ------------------------------------------------------------------ */
let passCount = 0;
let failCount = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passCount += 1;
    console.log(`   ✓ ${label}`);
  } else {
    failCount += 1;
    failures.push(label);
    console.log(`   ✗ ${label} ${detail ? `- ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/** Signs a JWT exactly like utils/jwt.signToken does ({ id, role }). */
function tokenFor(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "2h" });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sleeps until `ts` (epoch ms) has passed by a small safety pad. Used by the
 * expiry tests so they stay CORRECT at any database latency: the pre-expiry
 * requests may take a variable amount of time over a remote connection
 * (Neon), and a fixed sleep() could either fire too early or waste minutes.
 */
const sleepUntil = async (ts, padMs = 750) => {
  const waitMs = ts + padMs - Date.now();
  if (waitMs > 0) await sleep(waitMs);
};

/* ================================================================== */
async function runTests() {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      console.log(`[test] server on ${baseUrl}`);
      resolve();
    });
  });

  // The enrollment service checks real user rows. Create isolated, approved
  // fixtures for this run and delete them in finally; the pending user is the
  // explicit “not enrolled” case.
  await prisma.user.createMany({
    data: [
      { id: QA_USERS.studentA, studentCode: `B${Date.now()}1`, name: "QA Student A", password: "qa-only", role: "STUDENT", status: "APPROVED" },
      { id: QA_USERS.studentB, studentCode: `B${Date.now()}2`, name: "QA Student B", password: "qa-only", role: "STUDENT", status: "PENDING" },
      { id: QA_USERS.studentC, studentCode: `B${Date.now()}3`, name: "QA Student C", password: "qa-only", role: "STUDENT", status: "APPROVED" },
      { id: QA_USERS.studentZ, studentCode: `B${Date.now()}4`, name: "QA Student Z", password: "qa-only", role: "STUDENT", status: "APPROVED" },
    ],
  });
  setStudentNameForTesting(QA_USERS.studentA, "سارة أحمد");
  setStudentNameForTesting(QA_USERS.studentC, "منى خالد");
  setCourseRosterForTesting(COURSE, [QA_USERS.studentA, QA_USERS.studentC, QA_USERS.studentZ]);

  const teacher = tokenFor("teacher-t1", "TEACHER");
  const studentA = tokenFor(QA_USERS.studentA, "STUDENT");
  const studentB = tokenFor(QA_USERS.studentB, "STUDENT");
  const studentC = tokenFor(QA_USERS.studentC, "STUDENT");

  // Fresh timestamp on EVERY call — quiz windows are relative to when each
  // quiz is created, not to when the script started.
  const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();

  try {
    /* ================================================================
     * TEST 1 — creation: mixed types + image (teacher-only)
     * ================================================================ */
    section("TEST 1: teacher creates quiz (MCQ + written + image)");

    const created = await req("POST", "/api/quizzes", {
      token: teacher,
      body: {
        lessonId: "lesson-quiz-test",
        courseId: COURSE,
        title: "اختبار الدعامة والحركة",
        questionCount: 3,
        // Wide enough that TEST 2's whole flow fits even over a slow remote
        // DB connection, yet short enough that later release-gated tests
        // (9 / cumulative / 11) only wait briefly via sleepUntil().
        startTime: iso(-60_000),
        // Generous: on a loaded machine (dev stack + shared Neon) the
        // create/questions/submit/gate sections can take well over 90s.
        endTime: iso(+240_000),
        durationMinutes: 60,
      },
    });
    check("create quiz -> 201", created.status === 201, JSON.stringify(created.data));
    const quiz1 = created.data.quiz.id;

    const q1 = await req("POST", `/api/quizzes/${quiz1}/questions`, {
      token: teacher,
      body: {
        type: "mcq",
        text: "أي مما يلي يعطي الجسم ثباتاً؟",
        choices: ["العظام", "الهيكل المحوري", "العضلات", "الجلد"],
        correctIndex: 1,
      },
    });
    check("add MCQ -> 201", q1.status === 201);

    const q2 = await req("POST", `/api/quizzes/${quiz1}/questions`, {
      token: teacher,
      body: {
        type: "written",
        text: "اذكر العضو المسؤول عن إنتاج الطاقة في الخلية.",
        modelAnswer: "الميتوكوندريا",
      },
    });
    check("add WRITTEN -> 201", q2.status === 201);

    const q3Form = imageQuestionForm({
      type: "mcq",
      text: "ما نوع الدعامة الظاهر في الصورة؟",
      choices: [" outside", "دعامة خارجية", "دعامة داخلية", "لا شيء"],
      correctIndex: 0,
    });
    const q3 = await req("POST", `/api/quizzes/${quiz1}/questions`, {
      token: teacher,
      form: q3Form,
    });
    check(
      "add MCQ with IMAGE -> 201 (path stored, no bytes)",
      q3.status === 201 && typeof q3.data.question.imagePath === "string"
    );

    const overLimit = await req("POST", `/api/quizzes/${quiz1}/questions`, {
      token: teacher,
      body: { type: "written", text: "زائد", modelAnswer: "x" },
    });
    check("adding beyond declared count -> 400", overLimit.status === 400);

    const forbiddenCreate = await req("POST", "/api/quizzes", {
      token: studentA,
      body: {},
    });
    check("student cannot create quizzes -> 403", forbiddenCreate.status === 403);

    const teacherQuestions = await req(
      "GET",
      `/api/quizzes/${quiz1}/questions`,
      { token: teacher }
    );
    check(
      "teacher sees FULL questions (answers included)",
      teacherQuestions.data.questions.length === 3 &&
        teacherQuestions.data.questions[0].correctChoiceId === "c2" &&
        teacherQuestions.data.questions[1].modelAnswer === "الميتوكوندريا"
    );

    /* ================================================================
     * TEST 2 — student takes & completes inside the window (+leak scan)
     * ================================================================ */
    section("TEST 2: student starts/completes within window; no leaks");

    const noToken = await req("POST", `/api/quizzes/${quiz1}/start`);
    check("start WITHOUT token -> 401", noToken.status === 401);

    const notEnrolled = await req("POST", `/api/quizzes/${quiz1}/start`, {
      token: studentB,
    });
    check("NOT-enrolled student -> 403", notEnrolled.status === 403);

    // Hub attempt feed: NOTHING recorded yet for this student on this quiz.
    const mineBefore = await req("GET", "/api/quizzes/my-attempts", {
      token: studentA,
    });
    check(
      "my-attempts BEFORE starting has no entry for this quiz",
      mineBefore.status === 200 &&
        Boolean(mineBefore.data.attempts) &&
        mineBefore.data.attempts[quiz1] === undefined,
      JSON.stringify(mineBefore.data)
    );

    const start1 = await req("POST", `/api/quizzes/${quiz1}/start`, {
      token: studentA,
    });
    check(
      "enrolled student starts -> 201/started",
      start1.status === 201 && start1.data.status === "started",
      JSON.stringify(start1.data),
    );
    check(
      "server recorded start + personal deadline",
      Boolean(start1.data.startedAt && start1.data.personalDeadline)
    );

    // CRITICAL LEAK SCAN: no answers may reach the taking view.
    const takeViewJson = JSON.stringify(start1.data);
    check(
      "taking view hides correctChoiceId/modelAnswer",
      !takeViewJson.includes("correctChoiceId") &&
        !takeViewJson.includes("modelAnswer")
    );
    check("image exposed as signed URL", /signed\.test/.test(takeViewJson));

    const attempt1 = start1.data.attemptId;

    // Autosave as she goes: wrong MCQ choice...
    // (Use the CREATION-response ids, NOT positions in the taking view —
    // per-attempt shuffling makes positional picks random.)
    const wrongSave = await req("POST", `/api/quizzes/${quiz1}/answers`, {
      token: studentA,
      body: { questionId: q1.data.question.id, value: "c1" }, // wrong
    });
    check("autosave wrong MCQ choice -> 200", wrongSave.status === 200, `status: ${wrongSave.status}, data: ${JSON.stringify(wrongSave.data)}`);
    // ...written text...
    const writtenSave = await req("POST", `/api/quizzes/${quiz1}/answers`, {
      token: studentA,
      body: {
        questionId: q2.data.question.id,
        value: "النواة (إجابة خاطئة لكن تُحفظ فقط)",
      },
    });
    check("autosave written text -> 200", writtenSave.status === 200, `status: ${writtenSave.status}, data: ${JSON.stringify(writtenSave.data)}`);

    // ...and final flush with the right image-question answer.
    const submit1 = await req("POST", `/api/quizzes/${quiz1}/submit`, {
      token: studentA,
      body: {
        answers: { [q3.data.question.id]: "c1" }, // correct (index0->c1)
      },
    });
    check("manual submit -> 200", submit1.status === 200, `status: ${submit1.status}, data: ${JSON.stringify(submit1.data)}`);

    /* ---- TEST 5 folded here: immediate score = MCQ only -------------- */
    section("TEST 5: immediate score counts MCQ only");
    check(
      "score 1 / totalMcq 2 (written excluded)",
      submit1.data.result.score === 1 && submit1.data.result.totalMcq === 2,
      JSON.stringify(submit1.data.result)
    );
    check(
      "submission summary carries NO per-question detail",
      !JSON.stringify(submit1.data).includes("wasCorrect") &&
        !JSON.stringify(submit1.data).includes("correctChoiceId")
    );

    /* ---- TEST 5b: hub attempt-state feed (score without review) ------ */
    section("TEST 5b: hub feed reflects the submitted attempt");
    const mineAfter = await req("GET", "/api/quizzes/my-attempts", {
      token: studentA,
    });
    const mineEntry =
      mineAfter.data && mineAfter.data.attempts
        ? mineAfter.data.attempts[quiz1]
        : null;
    check(
      "my-attempts lists the quiz as submitted with the MCQ score",
      mineAfter.status === 200 &&
        Boolean(mineEntry) &&
        mineEntry.status === "submitted" &&
        mineEntry.usedAttempts === 1 &&
        mineEntry.allowedAttempts === 1 &&
        mineEntry.remainingAttempts === 0 &&
        Boolean(mineEntry.latestSubmitted) &&
        mineEntry.latestSubmitted.score === 1 &&
        mineEntry.latestSubmitted.totalMcq === 2,
      JSON.stringify(mineAfter.data)
    );
    check(
      "hub feed exposes NO per-question detail either",
      !JSON.stringify(mineEntry).includes("correctChoiceId") &&
        !JSON.stringify(mineEntry).includes("modelAnswer")
    );

    /* ================================================================
     * TEST 6 + 7 — gates BEFORE end_time (leaderboard + direct review)
     * ================================================================ */
    section("TESTS 6+7: pre-end_time gates");
    const lb1Early = await req("GET", `/api/quizzes/${quiz1}/leaderboard`, {
      token: studentA,
    });
    check(
      "leaderboard locked (released:false, rankings:null)",
      lb1Early.status === 200 &&
        lb1Early.data.released === false &&
        lb1Early.data.rankings === null,
      JSON.stringify(lb1Early.data)
    );

    const review1Early = await req(
      "GET",
      `/api/quiz-results/${submit1.data.result.resultId}/review`,
      { token: studentA }
    );
    check(
      "DIRECT review call before end_time -> 403 + availableAfter, no data",
      review1Early.status === 403 &&
        Boolean(review1Early.data.availableAfter) &&
        review1Early.data.review === null,
      JSON.stringify(review1Early.data)
    );

    const otherReview = await req(
      "GET",
      `/api/quiz-results/${submit1.data.result.resultId}/review`,
      { token: studentC }
    );
    check("another student cannot open someone else's result", otherReview.status === 403);

    const courseLbEarly = await req(
      "GET",
      `/api/courses/${COURSE}/leaderboard`,
      { token: teacher }
    );
    const earlyRowA = courseLbEarly.data.rankings.find(
      (row) => row.studentId === QA_USERS.studentA
    );
    check(
      "course board shows student-a with ZERO until quiz releases (score hidden, not excluded)",
      courseLbEarly.status === 200 &&
        earlyRowA &&
        earlyRowA.totalScore === 0 &&
        courseLbEarly.data.pendingQuizzes.some((quiz) => quiz.id === quiz1),
      JSON.stringify(courseLbEarly.data)
    );

    /* ================================================================
     * TEST 9 setup — grant-retry flow on QUIZ 6 (ends in ~3s)
     * ================================================================ */
    section("TEST 9 setup: two attempts, both kept");
    const created6 = await req("POST", "/api/quizzes", {
      token: teacher,
      body: {
        lessonId: "lesson-quiz-test",
        courseId: COURSE,
        title: "اختبار سريع للمحاولتين",
        questionCount: 1,
        // Same reasoning as quiz1: survives slow requests, ends before the
        // release-gated assertions (sleepUntil tops up the wait).
        startTime: iso(-1000),
        // Same headroom rule — sleepUntil() tops up any extra wait later.
        endTime: iso(+240_000),
        durationMinutes: 30,
      },
    });
    const quiz6 = created6.data.quiz.id;
    const q6 = await req("POST", `/api/quizzes/${quiz6}/questions`, {
      token: teacher,
      body: {
        type: "mcq",
        text: "٢+٢ ؟",
        choices: ["٣", "٤", "٥", "٦"],
        correctIndex: 1,
      },
    });
    const question6Id = q6.data.question.id;

    // Attempt 1: wrong answer, submitted.
    const s6a = await req("POST", `/api/quizzes/${quiz6}/start`, { token: studentC });
    await req("POST", `/api/quizzes/${quiz6}/submit`, {
      token: studentC,
      body: { answers: { [question6Id]: "c1" } }, // wrong
    });

    const retryDenied = await req("POST", `/api/quizzes/${quiz6}/start`, {
      token: studentC,
    });
    check("second try WITHOUT grant -> 403", retryDenied.status === 403);

    const granted = await req(
      "POST",
      `/api/quizzes/${quiz6}/students/${QA_USERS.studentC}/grant-retry`,
      { token: teacher }
    );
    check("teacher grants retry -> allowance 2", granted.data.allowedAttempts === 2);

    const s6b = await req("POST", `/api/quizzes/${quiz6}/start`, { token: studentC });
    check("retry start succeeds (attempt #2)", s6b.status === 201);
    await req("POST", `/api/quizzes/${quiz6}/submit`, {
      token: studentC,
      body: { answers: { [question6Id]: "c2" } }, // correct
    });

    const results6 = await req("GET", `/api/quizzes/${quiz6}/results`, {
      token: teacher,
    });
    const student6Row = results6.data.students.find(
      (row) => row.studentId === QA_USERS.studentC
    );
    check(
      "BOTH attempts stored & visible to teacher (0 then 1)",
      student6Row &&
        student6Row.attempts.length === 2 &&
        student6Row.attempts[0].score === 0 &&
        student6Row.attempts[1].score === 1,
      JSON.stringify(student6Row)
    );

    /* ================================================================
     * TEST 10a — happy-path RESUME (same quiz reopened, timer reduced)
     * ================================================================ */
    section("TEST 10a: resume restores answers and REDUCED timer");
    const created5 = await req("POST", "/api/quizzes", {
      token: teacher,
      body: {
        lessonId: "lesson-quiz-test",
        courseId: COURSE,
        title: "اختبار الاستكمال",
        questionCount: 2,
        startTime: iso(-1000),
        endTime: iso(+15 * 60_000),
        durationMinutes: 10,
      },
    });
    const quiz5 = created5.data.quiz.id;
    await req("POST", `/api/quizzes/${quiz5}/questions`, {
      token: teacher,
      body: {
        type: "mcq",
        text: "سؤال أول للاستكمال",
        choices: ["أ", "ب", "ج", "د"],
        correctIndex: 2,
      },
    });
    const q5b = await req("POST", `/api/quizzes/${quiz5}/questions`, {
      token: teacher,
      body: { type: "written", text: "سؤال مقالي للاستكمال", modelAnswer: "نموذجي" },
    });

    const s5first = await req("POST", `/api/quizzes/${quiz5}/start`, {
      token: studentA,
    });
    const fullTime = s5first.data.remainingSeconds;

    // She answers ONE question, then "closes the tab" (no further calls).
    await req("POST", `/api/quizzes/${quiz5}/answers`, {
      token: studentA,
      body: { questionId: s5first.data.questions[0].id, value: "c3" },
    });

    await sleep(2100); // away for ~2s

    const s5reopen = await req("POST", `/api/quizzes/${quiz5}/start`, {
      token: studentA,
    });
    check(
      "reopen -> status 'resumed' (no teacher approval needed)",
      s5reopen.data.status === "resumed",
      JSON.stringify(s5reopen.data)
    );
    check(
      "SAME attempt continues (not a fresh one)",
      s5reopen.data.attemptId === s5first.data.attemptId
    );
    check(
      "saved answer restored pre-filled",
      s5reopen.data.savedAnswers[s5first.data.questions[0].id] === "c3"
    );
    check(
      "timer REDUCED by time away (not reset)",
      s5reopen.data.remainingSeconds > 0 &&
        s5reopen.data.remainingSeconds <= fullTime - 2,
      `full=${fullTime}s now=${s5reopen.data.remainingSeconds}s`
    );
    check(
      "question order/content identical on resume",
      JSON.stringify(s5reopen.data.questions.map((q) => q.id)) ===
        JSON.stringify(s5first.data.questions.map((q) => q.id))
    );

    // Finish quiz 5 properly so its state is settled (stays OPEN for the
    // course-board "pending" demonstration later).
    await req("POST", `/api/quizzes/${quiz5}/submit`, {
      token: studentA,
      body: {
        answers: { [q5b.data.question.id]: "حاولت الإجابة" },
      },
    });

    /* ================================================================
     * Wait for the short-window quizzes to expire (Q1/Q6/Q3/Q4).
     * ================================================================ */
    section("Waiting for deadlines (~4s)...");
    await sleep(4200);

    /* ================================================================
     * TEST 10b — reopening AFTER personal timer ran out while away
     * (QUIZ 2: 3-second duration, long overall window)
     * ================================================================ */
    section("TESTS 3+10b: personal timer expiry + late reopen auto-submits");
    const created2 = await req("POST", "/api/quizzes", {
      token: teacher,
      body: {
        lessonId: "lesson-quiz-test",
        courseId: COURSE,
        title: "اختبار المؤقت الشخصي",
        questionCount: 2,
        startTime: iso(-1000),
        endTime: iso(+10 * 60_000), // overall window LONG -> personal wins
        durationMinutes: 0.1,        // = 6 seconds!
      },
    });
    // NOTE: quiz2's 6-second personal duration means we start it NOW and
    // wait for its own expiry below.
    const quiz2 = created2.data.quiz.id;
    const q2mcq = await req("POST", `/api/quizzes/${quiz2}/questions`, {
      token: teacher,
      body: {
        type: "mcq",
        text: "أكبر عضلة في جسم الإنسان؟",
        choices: ["الظهرية", "الفخذية", "الدالية", "المعينية"],
        correctIndex: 1,
      },
    });
    await req("POST", `/api/quizzes/${quiz2}/questions`, {
      token: teacher,
      body: { type: "written", text: "عدّاد", modelAnswer: "أي نص" },
    });

    const s2 = await req("POST", `/api/quizzes/${quiz2}/start`, { token: studentA });
    check("quiz2 started (6s personal timer)", s2.status === 201);
    check(
      "remainingSeconds respects the SHORT personal limit",
      s2.data.remainingSeconds <= 6,
      `got ${s2.data.remainingSeconds}`
    );

    // Answer correctly, then walk away WITHOUT submitting.
    // (On a loaded DB this autosave can itself cross the deadline and get
    // the 409 auto-submit response — handled after the reopen below.)
    const savedBeforeLeaving = await req("POST", `/api/quizzes/${quiz2}/answers`, {
      token: studentA,
      body: { questionId: q2mcq.data.question.id, value: "c2" },
    });

    await sleep(6500); // personal countdown dies while she is gone

    let s2back = await req("POST", `/api/quizzes/${quiz2}/start`, {
      token: studentA,
    });
    if (
      savedBeforeLeaving.status === 409 &&
      savedBeforeLeaving.data &&
      savedBeforeLeaving.data.result
    ) {
      // Slow roundtrips let the autosave finalize the attempt first;
      // grade from ITS result — same rule, different trigger point.
      console.log("   [flake-tolerant] autosave crossed the deadline; using its 409 result");
      s2back = {
        status: 200,
        data: { status: "auto_submitted", result: savedBeforeLeaving.data.result },
      };
    }
    check(
      "late reopen -> auto_submitted (cannot resume expired attempt)",
      s2back.status === 200 && s2back.data.status === "auto_submitted",
      JSON.stringify(s2back.data)
    );
    check(
      "auto-submitted with SAVED answers graded (1 of 1 MCQ; written excluded, reason auto-personal-timer)",
      s2back.data.result.score === 1 &&
        s2back.data.result.totalMcq === 1 &&
        s2back.data.result.submissionReason === "auto-personal-timer",
      JSON.stringify(s2back.data.result)
    );

    const retryAfterAuto = await req("POST", `/api/quizzes/${quiz2}/start`, {
      token: studentA,
    });
    check(
      "auto-submit consumed the attempt: another start -> 403",
      retryAfterAuto.status === 403
    );

    /* ================================================================
     * TEST 4 — OVERALL end_time cuts off BEFORE the personal timer
     * (dedicated quiz: long personal duration, tiny window)
     * ================================================================ */
    section("TEST 4: end_time cut-off beats personal countdown");
    const created3 = await req("POST", "/api/quizzes", {
      token: teacher,
      body: {
        lessonId: "lesson-quiz-test",
        courseId: COURSE,
        title: "اختبار انقطاع النافذة",
        questionCount: 1,
        // Window must outlive the setup requests even on a slow connection,
        // then expire via sleepUntil() below.
        startTime: iso(-500),
        endTime: iso(+15_000),   // window dies FIRST
        durationMinutes: 60,     // personal timer would allow much more
      },
    });
    const quiz3 = created3.data.quiz.id;
    const q3b = await req("POST", `/api/quizzes/${quiz3}/questions`, {
      token: teacher,
      body: {
        type: "mcq",
        text: "١٠×١٠ ؟",
        choices: ["٩٠", "١٠٠", "١١٠", "١٢٠"],
        correctIndex: 1,
      },
    });

    const s3 = await req("POST", `/api/quizzes/${quiz3}/start`, { token: studentA });
    check(
      "start honors the SMALLER limit (window, not 60min duration)",
      s3.status === 201 &&
        s3.data.remainingSeconds > 0 &&
        s3.data.remainingSeconds <= 16,
      `got ${s3.data.remainingSeconds}s`
    );

    await req("POST", `/api/quizzes/${quiz3}/answers`, {
      token: studentA,
      body: { questionId: q3b.data.question.id, value: "c2" }, // correct
    });

    await sleepUntil(Date.parse(created3.data.quiz.endTime)); // end_time passes; her personal timer still had ~59min

    const probe3 = await req("GET", `/api/quizzes/${quiz3}/attempt`, {
      token: studentA,
    });
    check(
      "cut off by END TIME even though personal time remained",
      probe3.data.status === "submitted" &&
        probe3.data.result.submissionReason === "auto-quiz-end" &&
        probe3.data.result.score === 1 &&
        probe3.data.result.totalMcq === 1,
      JSON.stringify(probe3.data)
    );

    /* ---- TEST 8 (part 1): review AFTER end_time ---------------------- */
    section("TEST 8: post-end_time review content");
    const review3 = await req(
      "GET",
      `/api/quiz-results/${probe3.data.result.resultId}/review`,
      { token: studentA }
    );
    check("review now opens -> 200 with review data", review3.status === 200 && Boolean(review3.data.review));
    const rv3q = review3.data.review.questions[0];
    check(
      "MCQ item exposes student choice + correct choice + flag",
      rv3q.studentChoiceId === "c2" &&
        rv3q.correctChoiceId === "c2" &&
        rv3q.wasCorrect === true,
      JSON.stringify(rv3q)
    );

    /* ================================================================
     * TEST 8 (part 2): WRONG mcq + written comparison (QUIZ 4)
     * ================================================================ */
    section("TEST 8b: wrong-MCQ coloring data + written side-by-side");
    const created4 = await req("POST", "/api/quizzes", {
      token: teacher,
      body: {
        lessonId: "lesson-quiz-test",
        courseId: COURSE,
        title: "اختبار المراجعة الملونة",
        questionCount: 2,
        // Wide enough for the setup requests on a slow connection; expiry is
        // awaited precisely with sleepUntil() below.
        startTime: iso(-500),
        endTime: iso(+30_000),
        durationMinutes: 30,
      },
    });
    const quiz4 = created4.data.quiz.id;
    const q4a = await req("POST", `/api/quizzes/${quiz4}/questions`, {
      token: teacher,
      body: {
        type: "mcq",
        text: "وحدة قياس القوة؟",
        choices: ["جول", "نيوتن", "وات", "أمبير"],
        correctIndex: 1,
      },
    });
    const q4b = await req("POST", `/api/quizzes/${quiz4}/questions`, {
      token: teacher,
      body: {
        type: "written",
        text: "عرّف التماثل.",
        modelAnswer: "التقابل بين أجزاء الجسم حول محور.",
      },
    });

    const s4 = await req("POST", `/api/quizzes/${quiz4}/start`, { token: studentC });
    // (explicit saves below, clearer than clever loops)
    await req("POST", `/api/quizzes/${quiz4}/answers`, {
      token: studentC,
      body: { questionId: q4a.data.question.id, value: "c3" }, // WRONG on purpose
    });
    await req("POST", `/api/quizzes/${quiz4}/answers`, {
      token: studentC,
      body: { questionId: q4b.data.question.id, value: "تشابه شكل الجسم" }, // saved, never scored
    });
    await sleepUntil(Date.parse(created4.data.quiz.endTime)); // let end_time pass

    const probe4 = await req("GET", `/api/quizzes/${quiz4}/attempt`, {
      token: studentC,
    });
    const review4 = await req(
      "GET",
      `/api/quiz-results/${probe4.data.result.resultId}/review`,
      { token: studentC }
    );
    const rv4mcq = review4.data.review.questions.find((q) => q.type === "mcq");
    const rv4written = review4.data.review.questions.find((q) => q.type === "written");

    check(
      "wrong MCQ: theirChoice≠correctChoice, wasCorrect=false (red/green inputs)",
      rv4mcq.studentChoiceId === "c3" &&
        rv4mcq.correctChoiceId === "c2" &&
        rv4mcq.wasCorrect === false,
      JSON.stringify(rv4mcq)
    );
    check(
      "written item: student text + model answer, NO grading flag whatsoever",
      rv4written.studentAnswer === "تشابه شكل الجسم" &&
        rv4written.modelAnswer === "التقابل بين أجزاء الجسم حول محور." &&
        !("wasCorrect" in rv4written) &&
        !("correct" in rv4written),
      JSON.stringify(rv4written)
    );
    check(
      "written never affected the score (still MCQ-only denominator)",
      review4.data.review.totalMcq === 1 && review4.data.review.score === 0
    );

    /* ---- TEST 6 (post): leaderboard RELEASED with best-attempt rule -- */
    section("TEST 9 verdict: leaderboard uses the BEST attempt");
    // quiz6's leaderboard is time-gated: wait until its window has REALLY
    // passed instead of assuming the requests above took long enough.
    await sleepUntil(Date.parse(created6.data.quiz.endTime));
    const lb6 = await req("GET", `/api/quizzes/${quiz6}/leaderboard`, {
      token: teacher,
    });
    check(
      "released:true and best score (1) ranked, worst (0) ignored",
      lb6.data.released === true &&
        lb6.data.rankings.find((r) => r.studentId === QA_USERS.studentC).bestScore === 1,
      JSON.stringify(lb6.data.rankings)
    );
    const lb3 = await req("GET", `/api/quizzes/${quiz3}/leaderboard`, {
      token: studentA,
    });
    const row3 = lb3.data.rankings.find((r) => r.studentId === QA_USERS.studentA);
    check(
      "real names shown; rank computed",
      lb3.data.released === true && row3.bestScore === 1 && row3.studentName === "سارة أحمد" && row3.rank === 1
    );

    /* ---- Final course leaderboard ------------------------------------ */
    section("Course cumulative leaderboard (all released except quiz5)");
    // The cumulative board only sums quizzes whose windows have ended, so
    // wait for quiz1 + quiz3 + quiz6 to be genuinely over at ANY latency.
    await sleepUntil(
      Math.max(
        Date.parse(created.data.quiz.endTime),
        Date.parse(created3.data.quiz.endTime),
        Date.parse(created6.data.quiz.endTime)
      )
    );
    const courseLb = await req("GET", `/api/courses/${COURSE}/leaderboard`, {
      token: teacher,
    });
    const rowA = courseLb.data.rankings.find((r) => r.studentId === QA_USERS.studentA);
    const rowC = courseLb.data.rankings.find((r) => r.studentId === QA_USERS.studentC);
    // Released by now: quiz1(1) + quiz3(1) + quiz6(0 for A, never took it)
    // = 2. quiz2/quiz5 windows are still open -> excluded as pending.
    check(
      "student-a sums best scores across RELEASED quizzes only (=2)",
      rowA.totalScore === 2,
      JSON.stringify(rowA)
    );
    check(
      "student-c present with retry-best counted (=1)",
      rowC.totalScore === 1,
      JSON.stringify(rowC)
    );
    check(
      "still-open quiz5 listed as pending, NOT summed",
      courseLb.data.pendingQuizzes.some((q) => q.title === "اختبار الاستكمال")
    );

    check(
      "roster student with zero appears at bottom (not excluded)",
      courseLb.data.rankings.some((r) => r.bestScore === 0)
    );

    /* ================================================================
     * TEST 11 - FRONTEND SUPPORT: student exams feed (Exams Hub source)
     * ================================================================ */
    section("TEST 11: GET /quizzes/available statuses for the Exams Hub");
    const hub = await req("GET", "/api/quizzes/available", { token: studentA });
    const byId = new Map(hub.data.exams.map((exam) => [exam.id, exam]));
    check(
      "hub feed lists every quiz with lesson, timing and duration",
      hub.status === 200 && byId.get(quiz1).lessonId === "lesson-quiz-test" &&
        byId.get(quiz1).durationMinutes === 60,
      JSON.stringify(hub.data).slice(0, 200)
    );
    check(
      "ended quizzes labeled 'ended'  (quiz1/3/6 windows passed)",
      ["quiz1", "quiz3", "quiz6"].every((label) =>
        ({ quiz1, quiz3, quiz6 })[label] &&
        byId.get({ quiz1, quiz3, quiz6 }[label]).status === "ended")
    );
    check(
      "still-open quizzes labeled 'active' (quiz5)",
      byId.get(quiz5) && byId.get(quiz5).status === "active"
    );
    const teacherHubPreview = await req("GET", "/api/quizzes/available", {
      token: teacher,
    });
    check("teacher can preview the exams feed -> 200",
      teacherHubPreview.status === 200);

    /* ================================================================
     * TEST 12 - NOTIFICATION on publish (shared helper reused)
     * ================================================================ */
    section("TEST 12: publishing a quiz notifies enrolled students");
    const createdNotif = await req("POST", "/api/quizzes", {
      token: teacher,
      body: {
        lessonId: "lesson-quiz-test",
        courseId: "biology",
        title: "اختبار الإشعارات",
        questionCount: 1,
        startTime: iso(-1000),
        endTime: iso(+60 * 60_000),
        durationMinutes: 20,
      },
    });
    const notifQuiz = createdNotif.data.quiz.id;
    await req("POST", `/api/quizzes/${notifQuiz}/questions`, {
      token: teacher,
      body: { type: "written", text: "سؤال", modelAnswer: "نموذج" },
    });

    check(
      "publishing a quiz requests a notification for approved students",
      testNotifications.some((notice) => notice.message.includes("اختبار الإشعارات")),
      JSON.stringify(testNotifications)
    );

    /* ================================================================
     * TEST 13 - RANDOMIZATION: persisted shuffle, differs per student
     * ================================================================ */
    section("TEST 13: per-attempt randomization (persisted across resume)");
    const createdShuffle = await req("POST", "/api/quizzes", {
      token: teacher,
      body: {
        lessonId: "lesson-quiz-test",
        courseId: COURSE,
        title: "اختبار الترتيب العشوائي",
        questionCount: 5,
        startTime: iso(-1000),
        endTime: iso(+30 * 60_000),
        durationMinutes: 30,
      },
    });
    const shuffleQuiz = createdShuffle.data.quiz.id;
    // 5 MCQs x 4 choices each -> huge permutation space.
    for (let i = 0; i < 5; i += 1) {
      await req(`POST`, `/api/quizzes/${shuffleQuiz}/questions`, {
        token: teacher,
        body: {
          type: "mcq",
          text: `سؤال رقم ${i + 1}`,
          choices: ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
          correctIndex: i % 4,
        },
      });
    }

    const sA = await req("POST", `/api/quizzes/${shuffleQuiz}/start`, {
      token: studentA,
    });
    const sC = await req("POST", `/api/quizzes/${shuffleQuiz}/start`, {
      token: studentC,
    });

    const orderOf = (startResponse) =>
      JSON.stringify({
        questions: startResponse.data.questions.map((q) => q.text),
        choiceOrders: startResponse.data.questions.map(
          (q) => q.choices && q.choices.map((c) => c.id).join("")
        ),
      });

    check(
      "student A and student C see DIFFERENT arrangement",
      orderOf(sA) !== orderOf(sC),
      "identical orders received"
    );
    check(
      "every MCQ still exposes all 4 choices after shuffling",
      sA.data.questions.every((q) => q.choices.length === 4)
    );

    // Persistence: A autosaves nothing structural, reopens -> same layout.
    await req("POST", `/api/quizzes/${shuffleQuiz}/answers`, {
      token: studentA,
      body: { questionId: sA.data.questions[0].id, value: "c2" },
    });
    const sAreopen = await req("POST", `/api/quizzes/${shuffleQuiz}/start`, {
      token: studentA,
    });
    check(
      "resume replays the EXACT same shuffled order (not re-shuffled)",
      sAreopen.data.status === "resumed" &&
        JSON.stringify(sAreopen.data.questions.map((q) => q.id)) ===
          JSON.stringify(sA.data.questions.map((q) => q.id)) &&
        JSON.stringify(sAreopen.data.questions.map((q) =>
          q.choices ? q.choices.map((c) => c.id).join("|") : null)) ===
          JSON.stringify(sA.data.questions.map((q) =>
            q.choices ? q.choices.map((c) => c.id).join("|") : null))
    );

    // Grading unaffected by shuffle: each question's text carries its
    // creation number ("سؤال رقم N"), and the teacher set correctIndex =
    // (N-1)%4 -> correct id c((N-1)%4+1). Answer everything correctly
    // THROUGH THE SHUFFLED VIEW and expect 5/5.
    const finalAnswers = {};
    for (const q of sA.data.questions) {
      const n = Number(q.text.match(/(\d+)/)[1]);
      finalAnswers[q.id] = `c${((n - 1) % 4) + 1}`;
    }
    const shuffleSubmit = await req("POST", `/api/quizzes/${shuffleQuiz}/submit`, {
      token: studentA,
      body: { answers: finalAnswers },
    });
    check(
      "grading matches by choice ID despite shuffled display (5/5)",
      shuffleSubmit.data.result.score === 5 &&
        shuffleSubmit.data.result.totalMcq === 5,
      JSON.stringify(shuffleSubmit.data.result)
    );
  } finally {
    server.close();

    // Self-cleanup: all quizzes use this run's unique course and all fixture
    // accounts use generated UUIDs. Cascades remove answers/mistakes first.
    try {
      await prisma.quiz.deleteMany({ where: { courseId: COURSE } });
      await prisma.user.deleteMany({
        where: { id: { in: Object.values(QA_USERS) } },
      });
      await prisma.$disconnect();
    } catch (_) {
      /* cleanup is best-effort; never mask test results */
    }
  }

  console.log("\n==============================================");
  console.log(`  RESULT: ${passCount} passed, ${failCount} failed`);
  if (failures.length) {
    console.log("  Failed:");
    failures.forEach((failure) => console.log(`   - ${failure}`));
  }
  console.log("==============================================");

  process.exit(failCount === 0 ? 0 : 1);
}

runTests().catch((error) => {
  console.error("[test] fatal:", error);
  process.exit(1);
});
