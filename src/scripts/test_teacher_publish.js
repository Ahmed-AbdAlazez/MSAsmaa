/* Headless reproduction + verification of the teacher publish-title bug.
 *
 * Simulates EXACTLY the production DOM situation on dashboard-teacher.html:
 *   1. the static page markup (including #teacher-quiz-builder),
 *   2. main.js's runtime injection of the LEGACY quiz panel (which contains
 *      an <input id="quiz-title">) EARLIER in the document,
 * then loads the REAL src/teacherQuizzes.js module, types a title into the
 * builder input, clicks 🚀 نشر, and asserts what publishQuiz actually reads.
 *
 * Run: node src/scripts/test_teacher_publish.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");

// ---- 1. build the DOM from the real page --------------------------------
const html = fs.readFileSync(path.join(ROOT, "dashboard-teacher.html"), "utf8");
const dom = new JSDOM(html, { url: "http://localhost/dashboard-teacher.html", runScripts: "outside-only" });
const { window } = dom;
const { document } = window;

window.localStorage.setItem("token", "fake-token");
window.localStorage.setItem("userRole", "teacher");
window.localStorage.setItem("userId", "teacher-t1");

// ---- 2. simulate main.js injecting the legacy panel BEFORE the builder ---
// (verbatim id-bearing subset of the legacy template from src/main.js)
const legacy = document.createElement("section");
legacy.id = "teacher-quiz-panel";
legacy.innerHTML = `
  <form id="teacher-quiz-form">
    <input type="text" id="quiz-title" class="form-input" required>
    <button type="submit" class="btn btn-primary">إرسال الاختبار للطلاب</button>
  </form>`;
document.querySelector("main .container").prepend(legacy); // earlier than builder section

console.log("[harness] #quiz-title count in document:",
  document.querySelectorAll("#quiz-title").length);
console.log("[harness] getElementById('quiz-title') resolves to legacy panel:",
  document.getElementById("quiz-title").closest("#teacher-quiz-panel") !== null);

// ---- 3. stubs the real module expects -----------------------------------
let fetchCalls = [];
const stubFetch = async (url, opts = {}) => {
  fetchCalls.push({ url: String(url), body: opts.body });
  if (/\/api\/quizzes($|\?)/.test(String(url))) {
    return { ok: true, status: 201, json: async () => ({ quiz: { id: "q-test-1" } }) };
  }
  return { ok: true, status: 201, json: async () => ({}) };
};
window.fetch = stubFetch;
globalThis.fetch = stubFetch;
window.URL.createObjectURL = () => "blob:fake";
window.alert = (m) => console.log("[alert-fallback]", m);
window.showToast = (message, kind) => console.log(`[toast:${kind}]`, message);

// Project the jsdom environment onto Node's globals so the real module
// (which uses bare `document`, `localStorage`, `window`, `fetch`, `URL`)
// executes against our simulated page.
globalThis.window = window;
globalThis.document = document;
globalThis.localStorage = window.localStorage;
globalThis.Event = window.Event;
globalThis.alert = window.alert;
globalThis.URL = { createObjectURL: () => "blob:fake" };

// flatpickr stub (pickers not needed to test title resolution)
class FakePicker {
  constructor(sel) {
    this.el = document.querySelector(sel);
    this.selectedDates = [new Date(Date.now() + 3600e3)];
    this.config = { onChange: [] };
  }
  setDate(d) { this.selectedDates = [d]; }
}
window.flatpickr = (sel) => new FakePicker(sel);
window.Arabic = {};
globalThis.flatpickr = window.flatpickr;
globalThis.Arabic = window.Arabic;

// ---- 4. load the REAL module with imports stripped -----------------------
// (jsdom can't resolve flatpickr/CSS imports; everything else is verbatim)
let src = fs.readFileSync(path.join(ROOT, "src", "teacherQuizzes.js"), "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?$/gm, "");
src += `\nexport { __fireDomContentLoadedForTests };`;
// expose the DOMContentLoaded listener: jsdom fires it naturally below

const modPath = path.join(__dirname, ".teacherQuizzes.loaded.mjs");
fs.writeFileSync(modPath, src.replace(/^export \{ __fireDomContentLoadedForTests \};$/m, ""));

(async () => {
  const mod = await import("file:///" + modPath.replace(/\\/g, "/"));

  // trigger bootstrap exactly like a real page load would
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await new Promise((r) => setTimeout(r, 20));

  const builderTitle = document.getElementById("builder-quiz-title");
  const legacyTitle = document.getElementById("quiz-title");
  console.log("[harness] builder input present:", !!builderTitle);

  // teacher TYPES into the visible builder field
  builderTitle.value = "اختبار الدعامة والحركة";
  builderTitle.dispatchEvent(new window.Event("input", { bubbles: true }));

  // sanity: legacy field stays empty (it is hidden in production)
  console.log("[harness] typed into builder:", JSON.stringify(builderTitle.value),
    "| legacy still:", JSON.stringify(legacyTitle.value));

  // stage one MCQ question so publish passes all validations
  document.getElementById("question-text").value = "المِيتُوكُونْدْرِيَا هِيَ مَصْدَرُ الطَّاقَةِ؟";
  ["النَّواة", "الرِّيبُوسُوم", "الجِهَازُ الغُلْجِي", "القَشْرَة"].forEach((c, i) => {
    document.getElementById(`choice-${i + 1}`).value = c;
  });
  document.getElementById("btn-stage-question").click();
  await new Promise((r) => setTimeout(r, 10));
  console.log("[harness] staged cards:", document.querySelectorAll("#staged-questions .staged-card").length);

  // click publish
  let consoleLogLines = [];
  const origLog = console.log;
  console.log = (...a) => { consoleLogLines.push(a.join(" ")); origLog(...a); };
  document.getElementById("btn-publish-quiz").click();
  await new Promise((r) => setTimeout(r, 30));
  console.log = origLog;

  // ---- verdicts ---------------------------------------------------------
  console.log("\n=== VERDICT ===");
  const debugLine = consoleLogLines.find((l) => l.includes("[publish-debug]"));
  console.log("debug line captured:", debugLine || "(none)");

  const createCall = fetchCalls.find((c) => c.url.includes("/api/quizzes") && !/\/questions/.test(c.url));
  let sentTitle = null;
  if (createCall) { try { sentTitle = JSON.parse(createCall.body).title; } catch {} }
  console.log("title sent to POST /api/quizzes:", JSON.stringify(sentTitle));

  const results = {
    "POST carried the TYPED title": sentTitle === "اختبار الدعامة والحركة",
    "success toast fired (publish completed)": consoleLogLines.some((l) => l.includes("تم نشر الاختبار")),
    "no empty-title validation toast fired": !consoleLogLines.some((l) => l.includes("اكتبي عنوان الاختبار")),
  };
  let pass = 0;
  for (const [name, ok] of Object.entries(results)) {
    console.log(ok ? "  ✓" : "  ✗", name);
    if (ok) pass++;
  }
  fs.unlinkSync(modPath);
  console.log(`\nRESULT: ${pass}/${Object.keys(results).length} passed`);
  process.exit(pass === Object.keys(results).length ? 0 : 1);
})();
