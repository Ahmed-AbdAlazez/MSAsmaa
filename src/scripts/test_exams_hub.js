/**
 * test_exams_hub.js
 * ---------------------------------------------------------------------------
 * Headless (jsdom) regression for the Exams Hub page logic in src/exams.js.
 *
 * Simulates a logged-in TEACHER opening exams.html:
 *   - login gate hides, app section shows, teacher subtitle is used
 *   - GET /api/quizzes/available renders an organized grid of exam cards
 *     grouped by lesson with fresh statuses and correct action buttons
 *   - course leaderboard endpoint renders without breaking the page
 *
 * Run: node src/scripts/test_exams_hub.js
 * ---------------------------------------------------------------------------
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

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

const PAGE_MARKUP = `
<div id="auth-area"></div>
<main class="container">
  <div id="exams-login-gate" style="display:none;"></div>
  <section id="exams-app" style="display:none;">
    <h1 id="exams-title">الاختبارات</h1>
    <p id="exams-subtitle"></p>
    <div class="exam-tabs">
      <button class="exam-tab active" data-tab="by-lesson">حسب الدرس</button>
      <button class="exam-tab" data-tab="all">كل الاختبارات</button>
    </div>
    <div id="exams-by-lesson"></div>
    <div id="exams-all" style="display:none;"></div>
    <section class="card" id="course-leaderboard-card">
      <h2>ترتيب الكورس</h2>
      <div id="course-leaderboard-body"><div class="loading">جارٍ التحميل…</div></div>
    </section>
  </section>
</main>
<div id="quiz-run-overlay" style="display:none;">
  <div class="overlay-panel">
    <div class="quiz-run-head">
      <div><h2 id="run-title"></h2><span id="run-meta" class="muted"></span></div>
      <div id="run-timer" class="quiz-timer">--:--</div>
    </div>
    <div id="run-questions"></div>
    <div class="quiz-run-actions">
      <button id="btn-submit-quiz">تسليم</button>
      <button id="btn-close-run">خروج</button>
    </div>
  </div>
</div>
<div id="quiz-result-overlay" style="display:none;">
  <div class="overlay-panel">
    <button id="btn-close-result">إغلاق</button>
    <div id="result-summary"></div>
    <div id="quiz-leaderboard-body"></div>
    <div id="review-body"></div>
  </div>
</div>
<div id="toast-container"></div>
`;

async function main() {
  const dom = new JSDOM(`<!doctype html><html dir="rtl"><body>${PAGE_MARKUP}</body></html>`, {
    url: "http://localhost:5173/exams.html",
  });
  const { window } = dom;
  const { document } = window;

  // ---- globals the module expects -------------------------------------
  global.window = window;
  global.document = document;
  global.Event = window.Event;
  global.localStorage = {
    store: { token: "jwt-fake", userRole: "teacher", userName: "أ. أسماء" },
    getItem(k) { return this.store[k] ?? null; },
    setItem(k, v) { this.store[k] = String(v); },
    removeItem(k) { delete this.store[k]; },
  };
  global.alert = () => {};
  global.confirm = () => true;
  window.confirm = global.confirm;

  const EXAMS = [
    { id: "q-up", title: "اختبار قادم", lessonId: "lesson-1", courseId: "biology",
      questionCount: 3, startTime: new Date(Date.now() + 864e5).toISOString(),
      endTime: new Date(Date.now() + 9e5 + 864e5).toISOString(), durationMinutes: 15,
      status: "upcoming" },
    { id: "q-on", title: "اختبار جاري الآن", lessonId: "lesson-1", courseId: "biology",
      questionCount: 2, startTime: new Date(Date.now() - 6e5).toISOString(),
      endTime: new Date(Date.now() + 36e5).toISOString(), durationMinutes: 20,
      status: "active" },
    { id: "q-end", title: "اختبار منتهي", lessonId: "lesson-2", courseId: "biology",
      questionCount: 4, startTime: new Date(Date.now() - 72e6).toISOString(),
      endTime: new Date(Date.now() - 36e6).toISOString(), durationMinutes: 10,
      status: "ended" },
  ];

  const errorsSeen = [];
  const realError = console.error;
  console.error = (...args) => errorsSeen.push(args.join(" "));

  global.fetch = async (url) => {
    const target = String(url);
    if (target.includes("/api/quizzes/available")) {
      return { ok: true, status: 200, json: async () => ({ exams: EXAMS }) };
    }
    if (target.includes("/api/courses/biology/leaderboard")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          rankings: [
            { userId: "student-hub", name: "سارة", bestScore: 8, totalMcq: 10 },
          ],
          pendingQuizzes: [],
        }),
      };
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: `unmocked ${target}` }),
    };
  };

  // ---- load the real module (exports stripped like the publish harness)
  let source = fs.readFileSync(
    path.join(__dirname, "..", "exams.js"),
    "utf8"
  );
  source = source.replace(/^export /gm, "");
  window.eval(source);

  // Bootstrap listens for DOMContentLoaded; jsdom already fired it during
  // construction, so dispatch it again for the freshly-attached listener.
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await new Promise((resolve) => setTimeout(resolve, 30));

  // ---- assertions -------------------------------------------------------
  check(
    "login gate hidden for logged-in user",
    document.getElementById("exams-login-gate").style.display === "none"
  );
  check("app section shown", document.getElementById("exams-app").style.display === "");
  check(
    "teacher subtitle used",
    document.getElementById("exams-subtitle").textContent.includes("معلمة")
  );

  const byLessonHtml = document.getElementById("exams-by-lesson").innerHTML;
  check("no failure message rendered", !byLessonHtml.includes("تعذر تحميل"));
  check("groups wrapped in .exam-group sections", byLessonHtml.includes('class="exam-group"'));
  check("cards laid out in .exam-grid", byLessonHtml.includes('class="exam-grid"'));

  const cards = document.querySelectorAll("#exams-by-lesson .exam-card");
  check("three exam cards render", cards.length === 3, `got ${cards.length}`);

  const statusClasses = new Set(
    [...document.querySelectorAll("#exams-by-lesson .exam-status")].map((el) =>
      [...el.classList].find((c) => c !== "exam-status")
    )
  );
  check(
    "fresh statuses present",
    statusClasses.has("upcoming") && statusClasses.has("active") && statusClasses.has("ended"),
    [...statusClasses].join(",")
  );
  check(
    "active card offers take button",
    Boolean(document.querySelector('.exam-card[data-exam-id="q-on"] .btn-take'))
  );
  check(
    "ended card offers result button",
    Boolean(document.querySelector('.exam-card[data-exam-id="q-end"] .btn-result'))
  );
  check(
    "card structure has top/meta/footer rows",
    cards[0] && cards[0].querySelector(".exam-card-top") &&
      cards[0].querySelector(".exam-meta") && cards[0].querySelector(".exam-foot")
  );

  const lbBody = document.getElementById("course-leaderboard-body").innerHTML;
  check("course leaderboard rendered a table", lbBody.includes("<table"));

  realError.call(console, ...[]);
  console.error = realError;
  check("no console.error emitted during load", errorsSeen.length === 0,
    errorsSeen.join(" | ").slice(0, 200));

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("[test_exams_hub] fatal:", error);
  process.exit(1);
});
