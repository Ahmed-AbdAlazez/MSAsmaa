/**
 * exams.js
 * ---------------------------------------------------------------------------
 * Student-facing Exams Hub. Talks ONLY to the already-built quiz backend:
 *
 *   GET  /api/quizzes/available?courseId=biology    hub feed (server status)
 *   POST /api/quizzes/:id/start                     start OR auto-resume
 *   POST /api/quizzes/:id/answers                   autosave on every change
 *   POST /api/quizzes/:id/submit                    manual submit
 *   GET  /api/quizzes/:id/leaderboard               per-quiz ranking (gated)
 *   GET  /api/courses/:courseId/leaderboard         cumulative course board
 *   GET  /api/quiz-results/:resultId/review         gated answer review
 *
 * The server owns ALL timing truth: remainingSeconds from the start response
 * drives the countdown, and submit is attempted at zero (the backend also
 * enforces its own deadlines regardless of what this UI does).
 */

const API = "";
const COURSE_ID = "biology";

/* ---------------- shared tiny helpers ---------------- */

function getToken() {
  return localStorage.getItem("token");
}

function getRole() {
  return String(localStorage.getItem("userRole") || "").toLowerCase();
}

async function api(method, path, body) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (body) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    /* Network/DNS failure: normalize to status 0 so every caller's existing
       !ok branch handles it instead of dying as an unhandled rejection
       (which is what made buttons like "Start Exam" silently do nothing). */
    return { ok: false, status: 0, data: null };
  }
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* ignore non-JSON */
  }
  return { ok: res.ok, status: res.status, data };
}

/** Minimal toast system local to this page (main.js toasts aren't global). */
export function showToast(message, kind = "info", ms = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), ms);
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-EG", {
    day: "numeric",
    month: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value == null ? "" : value);
  return div.innerHTML;
}

/* =====================================================================
 * HUB RENDERING
 * ===================================================================== */

const STATUS_LABELS = {
  upcoming: "لم يبدأ بعد",
  active: "متاح الآن — ابدئي",
  ended: "انتهى",
};

/* Per-student attempt state keyed by quizId, filled by loadHub() from
   GET /api/quizzes/my-attempts. Lets each card show its real state:
   not attempted -> Start; attempted & exhausted -> score / submitted;
   attempted with a granted retry -> score + Start again. */
let myAttempts = {};

function attemptFor(examId) {
  return myAttempts[examId] || null;
}

/** Compact green chip showing this student's MCQ score on one exam. */
function scoreChipHtml(result) {
  if (!result || result.score == null) return "";
  return `<div class="score-chip">🎯 درجتك: ${result.score}/${result.totalMcq ?? "?"}</div>`;
}

function examCardHtml(exam) {
  const lessonName =
    window.CURRICULUM &&
    (() => {
      for (const chapter of window.CURRICULUM.biology || []) {
        const found = (chapter.lessons || []).find(
          (lesson) => lesson.id === exam.lessonId
        );
        if (found) return found.name;
      }
      return null;
    })();

  // For mixed quizzes, resolve covered lesson names from exam.lessonIds
  const coveredLessonNames = (() => {
    if (!exam.isMixed || !exam.lessonIds || !window.CURRICULUM) return [];
    const names = [];
    for (const lid of exam.lessonIds) {
      for (const chapter of window.CURRICULUM.biology || []) {
        const found = (chapter.lessons || []).find((l) => l.id === lid);
        if (found) { names.push(found.name); break; }
      }
    }
    return names;
  })();

  const att = attemptFor(exam.id);
  const submitted = att && att.latestSubmitted ? att.latestSubmitted : null;
  const remaining = att ? att.remainingAttempts : 1;
  const canResume = Boolean(att && att.status === "in_progress");
  const exhausted = Boolean(submitted) && remaining <= 0;

  let badgeLabel = STATUS_LABELS[exam.status];
  if (exam.status === "active" && submitted && !canResume) {
    badgeLabel = exhausted ? "تم التسليم ✓" : "تم التسليم — إعادة متاحة";
  }
  const badge = `<span class="exam-status ${exam.status}${submitted ? " submitted" : ""}">${badgeLabel}</span>`;

  let action;
  if (exam.status === "active") {
    if (exhausted) {
      // Attempt already used and no retry granted: NEVER render an active
      // Start button here — clicking it could only fail server-side.
      action =
        scoreChipHtml(submitted) +
        `<button class="btn btn-secondary btn-result" data-id="${exam.id}">النتيجة والمراجعة</button>`;
    } else {
      const startLabel = canResume
        ? "كمّلي الحل"
        : submitted
          ? "ابدئي الحل (محاولة إضافية)"
          : "ابدئي الحل";
      action =
        scoreChipHtml(submitted) +
        `<button class="btn btn-primary btn-take" data-id="${exam.id}">${startLabel}</button>`;
    }
  } else if (exam.status === "ended") {
    action =
      scoreChipHtml(submitted) +
      `<button class="btn btn-secondary btn-result" data-id="${exam.id}">النتيجة والمراجعة</button>`;
  } else {
    action = `<span class="muted">تبدأ ${formatDateTime(exam.startTime)}</span>`;
  }

  return `
  <article class="exam-card${submitted ? " is-attempted" : ""}" data-exam-id="${exam.id}">
    <div class="exam-card-top">
      <div class="exam-title">${escapeHtml(exam.title)}</div>
      ${badge}
    </div>
    <div class="exam-meta">
      <span>📘 ${escapeHtml(exam.isMixed && coveredLessonNames.length ? `يشمل ${coveredLessonNames.length} دروس` : lessonName || exam.lessonId)}</span>
      <span>🕒 تبدأ: ${formatDateTime(exam.startTime)}</span>
      <span>⏹ تنتهي: ${formatDateTime(exam.endTime)}</span>
      <span>⏱ المدة: ${exam.durationMinutes} دقيقة</span>
      <span>❓ ${exam.questionCount} سؤال</span>
    </div>
    <div class="exam-foot">
      ${action}
    </div>
  </article>`;
}

function renderExams(exams, tab) {
  const byLesson = document.getElementById("exams-by-lesson");
  const all = document.getElementById("exams-all");
  const mixed = document.getElementById("exams-mixed");

  // Separate mixed quizzes from single-lesson quizzes
  const mixedExams = exams.filter((e) => e.isMixed);
  const singleExams = exams.filter((e) => !e.isMixed);

  // Flat chronological view — only single-lesson quizzes
  all.innerHTML =
    singleExams.length === 0
      ? '<p class="muted">لا توجد اختبارات متاحة حالياً.</p>'
      : `<div class="exam-grid">${singleExams.map(examCardHtml).join("")}</div>`;

  // Mixed quizzes tab
  mixed.innerHTML =
    mixedExams.length === 0
      ? '<p class="muted">لا توجد اختبارات مجمعة.</p>'
      : `<div class="exam-grid">${mixedExams.map(examCardHtml).join("")}</div>`;

  // Grouped-by-lesson view — only single-lesson quizzes
  const groups = new Map();
  for (const exam of singleExams) {
    const key = exam.lessonId || "__unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(exam);
  }
  byLesson.innerHTML =
    groups.size === 0
      ? '<p class="muted">لا توجد اختبارات بعد.</p>'
      : [...groups.entries()]
          .map(([lessonId, lessonExams]) => {
            let lessonName = lessonId;
            if (window.CURRICULUM) {
              for (const chapter of window.CURRICULUM.biology || []) {
                const found = (chapter.lessons || []).find(
                  (l) => l.id === lessonId
                );
                if (found) lessonName = found.name;
              }
            }
            return `<section class="exam-group">
                      <h3 class="exam-group-title">📘 ${escapeHtml(lessonName)}</h3>
                      <div class="exam-grid">${lessonExams.map(examCardHtml).join("")}</div>
                    </section>`;
          })
          .join("");

  showTab(tab);
}

function showTab(tab) {
  document.querySelectorAll(".exam-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.getElementById("exams-by-lesson").style.display =
    tab === "by-lesson" ? "" : "none";
  document.getElementById("exams-all").style.display =
    tab === "all" ? "" : "none";
  document.getElementById("exams-mixed").style.display =
    tab === "mixed" ? "" : "none";
}

async function loadHub() {
  // One course per page: ask the backend for THIS course's exams only, so
  // rows from other courses (e.g. synthetic data used by automated tests)
  // can never appear here no matter what is in the database.
  const [feed, mine] = await Promise.all([
    api("GET", `/api/quizzes/available?courseId=${encodeURIComponent(COURSE_ID)}`),
    api("GET", "/api/quizzes/my-attempts"),
  ]);
  const { ok, status, data } = feed;

  // Attempt state is an enhancement: if it fails we degrade gracefully to
  // the old behavior (every active exam shows Start) instead of breaking.
  if (mine.ok && mine.data && mine.data.attempts) {
    myAttempts = mine.data.attempts;
  } else if (!mine.ok && mine.status !== 401) {
    console.error("[exams] failed to load /api/quizzes/my-attempts:", mine.status);
    myAttempts = {};
  }

  if (!ok) {
    // Surface the REAL failure (status + backend message) to the console
    // so a generic "confirm login" message never hides the actual cause.
    console.error(
      "[exams] failed to load /api/quizzes/available:",
      status,
      data && data.error ? data.error : data
    );
    const reason =
      status === 401
        ? "تعذر تحميل الاختبارات. تأكدي من تسجيل الدخول."
        : status === 0
          ? "تعذر الوصول للسيرفر. تأكدي من تشغيله ثم أعيدي التحميل."
          : `تعذر تحميل الاختبارات (خطأ ${status}).`;
    document.getElementById("exams-by-lesson").innerHTML =
      `<p class="muted">${reason}</p>`;
    document.getElementById("exams-all").innerHTML = "";
    return;
  }
  renderExams(data.exams || [], "by-lesson");
}

/* =====================================================================
 * TAKE-QUIZ FLOW
 * ===================================================================== */

const runState = {
  quizId: null,
  quizIdForLookup: null,
  attemptId: null,
  timerInterval: null,
  warned5min: false,
  warned1min: false,
  starting: false,   // double-click guard for "Start Exam"
  submitting: false, // double-click guard for submit
  answers: {}, // questionId -> value (client mirror for the final flush)
  inFullscreen: false, // tracking fullscreen mode
  fullscreenExitCount: 0, // track accidental exits (don't auto-submit)
};

function stopTimer() {
  if (runState.timerInterval) clearInterval(runState.timerInterval);
  runState.timerInterval = null;
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Countdown driven by the SERVER-provided remaining time. Fires the two
 * required warnings (5 min then 1 min) exactly once each, and attempts a
 * submit when it reaches zero. This does NOT change real auto-submit logic —
 * the backend finalizes on its own even if this tab is closed.
 */
function startTimer(remainingSeconds) {
  stopTimer();
  runState.warned5min = false;
  runState.warned1min = false;

  const timerEl = document.getElementById("run-timer");
  let left = remainingSeconds;
  const paint = () => {
    timerEl.textContent = formatClock(Math.max(0, left));
    timerEl.classList.toggle("timer-warning", left <= 300 && left > 60);
    timerEl.classList.toggle("timer-danger", left <= 60);

    if (left <= 300 && left > 60 && !runState.warned5min) {
      runState.warned5min = true;
      showToast("⚠️ تبقّت ٥ دقائق!", "warning");
    }
    if (left <= 60 && !runState.warned1min) {
      runState.warned1min = true;
      showToast("🚨 دقيقة واحدة متبقية!", "danger");
    }
    if (left <= 0) {
      stopTimer();
      submitQuiz(true);
    }
    left -= 1;
  };

  paint();
  runState.timerInterval = setInterval(paint, 1000);
}

function questionBlockHtml(question, savedValue, qIndex) {
  const num = qIndex != null ? qIndex + 1 : "";
  const numBadge = num ? `<span class="q-number">${num}</span>` : "";
  const typeBadge = question.type === "mcq"
    ? `<span class="q-type-badge q-type-mcq">اختيارات</span>`
    : `<span class="q-type-badge q-type-written">مقالي</span>`;

  if (question.type === "mcq") {
    const choiceKeys = ["أ", "ب", "ج", "د"];
    const choices = question.choices
      .map((choice, ci) => {
        const checked = savedValue === choice.id ? "checked" : "";
        const selected = savedValue === choice.id ? " selected" : "";
        return `<label class="choice-card${selected}">
                  <input type="radio" name="q-${question.id}" value="${choice.id}" data-qid="${question.id}" class="mcq-choice" ${checked}>
                  <span class="choice-key">${choiceKeys[ci] || (ci + 1)}</span>
                  <span class="choice-text">${escapeHtml(choice.text)}</span>
                </label>`;
      })
      .join("");
    const image = question.imageUrl
      ? `<img class="question-image" src="${question.imageUrl}" alt="صورة السؤال">`
      : "";
    return `<div class="question-block" data-question="${question.id}">
              <div class="q-head">${numBadge}<div class="q-text">${escapeHtml(question.text)}</div>${typeBadge}</div>
              ${image}
              <div class="choices-grid">${choices}</div>
            </div>`;
  }

  // written
  const image = question.imageUrl
    ? `<img class="question-image" src="${question.imageUrl}" alt="صورة السؤال">`
    : "";
  return `<div class="question-block" data-question="${question.id}">
            <div class="q-head">${numBadge}<div class="q-text">${escapeHtml(question.text)}</div>${typeBadge}</div>
            ${image}
            <textarea class="written-answer" data-qid="${question.id}"
              placeholder="اكتبي إجابتك هنا…">${escapeHtml(savedValue || "")}</textarea>
          </div>`;
}

function openRun(payload, quizTitle, quizId) {
  runState.quizId = quizId;
  runState.attemptId = payload.attemptId;
  runState.answers = { ...(payload.savedAnswers || {}) };
  runState.inFullscreen = false;
  runState.fullscreenExitCount = 0;

  document.getElementById("run-title").textContent = quizTitle;
  document.getElementById("run-meta").textContent =
    payload.status === "resumed"
      ? `أكملتي محاولتك السابقة — الوقت المتبقي ${Math.ceil(payload.remainingSeconds / 60)} دقيقة`
      : `المدة ${payload.durationMinutes} دقيقة — بالتوفيق!`;

  document.getElementById("run-questions").innerHTML = payload.questions
    .map((question, qi) =>
      questionBlockHtml(question, (payload.savedAnswers || {})[question.id], qi)
    )
    .join("");

  document.getElementById("quiz-run-overlay").style.display = "flex";
  startTimer(payload.remainingSeconds);

  // Request fullscreen mode for focused exam taking.
  // When fullscreen succeeds the fullscreenchange handler adds the
  // .exam-fullscreen class. When it fails (or the API is absent) we
  // add it immediately so the enhanced layout still applies.
  const runOverlay = document.getElementById("quiz-run-overlay");
  if (runOverlay && runOverlay.requestFullscreen) {
    runOverlay.requestFullscreen().catch((err) => {
      console.log("Fullscreen request failed:", err);
      showToast("تعذّر فتح وضع ملء الشاشة. يمكنك المتابعة عادياً.", "info");
      runOverlay.classList.add("exam-fullscreen");
    });
  } else if (runOverlay) {
    runOverlay.classList.add("exam-fullscreen");
  }

  // Autosave on EVERY change so an interrupted session resumes pre-filled.
  document.getElementById("run-questions").onchange = async (event) => {
    const target = event.target;
    const questionId = target.dataset.qid;
    if (!questionId) return;
    const value = target.type === "radio" ? target.value : target.value;
    runState.answers[questionId] = value;

    // Toggle .selected on choice cards for visual feedback
    if (target.type === "radio") {
      const block = target.closest(".question-block");
      if (block) {
        block.querySelectorAll(".choice-card").forEach((c) => c.classList.remove("selected"));
        const card = target.closest(".choice-card");
        if (card) card.classList.add("selected");
      }
    }

    const save = await api("POST", `/api/quizzes/${runState.quizId}/answers`, {
      questionId,
      value,
    });
    if (save.status === 409 && save.data && save.data.result) {
      // Server says time is up - it already auto-submitted us.
      showToast(save.data.error, "warning");
      closeRun();
      openResult(
        runState.quizIdForLookup || runState.quizId,
        save.data.result.resultId,
        save.data.result
      );
    }
  };
}

function closeRun() {
  stopTimer();
  // Exit fullscreen when closing the quiz (after submission)
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {
      // Ignore errors if already exited
    });
  }
  // Clean up fullscreen layout class
  const runOverlay = document.getElementById("quiz-run-overlay");
  if (runOverlay) runOverlay.classList.remove("exam-fullscreen");
  document.getElementById("quiz-run-overlay").style.display = "none";
}

async function beginQuiz(quizId, quizTitle) {
  if (runState.starting) return; // ignore rapid double-clicks
  runState.starting = true;
  try {
    const { ok, status, data } = await api(
      "POST",
      `/api/quizzes/${quizId}/start`
    );

    if (!ok) {
      showToast(
        data && data.error
          ? data.error
          : status === 0
            ? "تعذر الوصول للسيرفر. تأكدي من الاتصال ثم أعيدي المحاولة."
            : "تعذر بدء الاختبار.",
        "danger"
      );
      return;
    }

    if (data.status === "auto_submitted") {
      // Their personal countdown expired while away.
      showToast("انتهى وقت المحاولة وتم التسليم التلقائي.", "warning");
      openResult(quizId, data.result.resultId, data.result);
      return;
    }

    runState.quizIdForLookup = quizId;
    openRun({ ...data }, quizTitle, quizId);
  } finally {
    runState.starting = false;
  }
}

async function submitQuiz(auto = false) {
  if (runState.submitting) return; // ignore double submit
  runState.submitting = true;
  try {
    const { ok, data } = await api(
      "POST",
      `/api/quizzes/${runState.quizId}/submit`,
      { answers: runState.answers }
    );
    closeRun();
    loadHub(); // refresh statuses

    if (!ok) {
      showToast(data && data.error ? data.error : "تعذر التسليم.", "danger");
      return;
    }
    showToast(auto ? "انتهى الوقت — تم التسليم التلقائي." : "تم تسليم الاختبار ✅", "success");
    // data.result carries the graded MCQ score — show it right now.
    openResult(runState.quizId, data.result.resultId, data.result);
  } finally {
    runState.submitting = false;
  }
}

/* =====================================================================
 * RESULT VIEW: score banner + THIS quiz's leaderboard + gated review
 * ===================================================================== */

/**
 * The numeric MCQ score is visible IMMEDIATELY after submission (it always
 * travels on the submit/attempt responses) — only the per-question right/
 * wrong breakdown waits for end_time. This banner is therefore rendered
 * straight from the submit response, never from the gated review endpoint.
 */
function renderScoreBanner(result) {
  const summary = document.getElementById("result-summary");
  if (!summary || !result || result.score == null) return;
  summary.innerHTML = `<div class="score-banner">درجتك: ${result.score} من ${result.totalMcq ?? "?"}
    <span class="muted" style="font-weight:400;">(أسئلة الاختيارات فقط)</span></div>`;
}

async function openResult(quizId, resultId, summaryData = null) {
  document.getElementById("quiz-result-overlay").style.display = "flex";

  const lbBody = document.getElementById("quiz-leaderboard-body");
  const reviewBody = document.getElementById("review-body");

  // The score shows instantly — even before end_time releases the review.
  if (summaryData) {
    renderScoreBanner(summaryData);
    document.getElementById("review-body").innerHTML =
      '<div class="loading">جارٍ التحميل…</div>';
  }

  // Opening an ENDED exam from the hub has no resultId yet - ask the
  // backend for this student's latest submitted attempt first. Its summary
  // carries the score too, so the banner fills without waiting for review.
  if (!resultId) {
    const attempt = await api("GET", `/api/quizzes/${quizId}/attempt`);
    if (attempt.ok && attempt.data.result) {
      resultId = attempt.data.result.resultId;
      if (!summaryData) {
        renderScoreBanner(attempt.data.result);
        document.getElementById("review-body").innerHTML =
          '<div class="loading">جارٍ التحميل…</div>';
      }
    }
  }

  /* ---- per-quiz leaderboard (backend enforces end_time gating) ----- */
  lbBody.innerHTML = '<div class="loading">جارٍ التحميل…</div>';
  const lb = await api("GET", `/api/quizzes/${quizId}/leaderboard`);
  if (lb.ok && lb.data.released) {
    lbBody.innerHTML = leaderboardTable(lb.data.rankings);
  } else if (lb.ok) {
    lbBody.innerHTML = `<div class="locked-note">🔒 لوحة الترتيب تظهر بعد انتهاء وقت الاختبار للجميع (${formatDateTime(lb.data.availableAfter)}).</div>`;
  } else {
    lbBody.innerHTML = '<p class="muted">تعذر تحميل لوحة الترتيب.</p>';
  }

  /* ---- review (server rejects before end_time - handle gracefully) -- */
  reviewBody.innerHTML = '<div class="loading">جارٍ التحميل…</div>';
  if (!resultId) {
    reviewBody.innerHTML = '<p class="muted">لا توجد محاولة مسجلة لهذا الاختبار بعد.</p>';
    return;
  }
  const review = await api(
    "GET",
    `/api/quiz-results/${resultId}/review`
  );

  if (review.status === 403) {
    reviewBody.innerHTML = `<div class="locked-note">🔒 ${escapeHtml(
      (review.data && review.data.message) || "المراجعة غير متاحة بعد."
    )} (${formatDateTime(review.data && review.data.availableAfter)})</div>`;
    return;
  }
  if (!review.ok) {
    reviewBody.innerHTML = '<p class="muted">تعذر تحميل المراجعة.</p>';
    return;
  }

  const r = review.data.review;
  // Review (released after end_time) re-renders the banner from the
  // authoritative record — same numbers, now alongside the breakdown.
  renderScoreBanner(r);
  reviewBody.innerHTML = r.questions.map(reviewQuestionHtml).join("");
}

function leaderboardTable(rankings) {
  const medals = ["🥇", "🥈", "🥉"];
  const me = String(localStorage.getItem("userId") || "");
  return `<table class="lb-table">
    <thead><tr><th>#</th><th>الطالبة</th><th>الدرجة</th></tr></thead>
    <tbody>
      ${rankings
        .map(
          (row) => `<tr class="${row.studentId === me ? "me" : ""}">
            <td>${
              row.rank <= 3 ? `<span class="rank-medal">${medals[row.rank - 1]}</span>` : ""
            } ${row.rank}</td>
            <td>${escapeHtml(row.studentName)}</td>
            <td>${row.bestScore}</td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

/**
 * Review rendering rules (from the platform spec):
 *  - MCQ right   -> ONLY the correct choice green.
 *  - MCQ wrong   -> student pick red AND correct choice green.
 *  - Written     -> student text vs model answer side by side, NO colors.
 */
function reviewQuestionHtml(question) {
  if (question.type === "mcq") {
    const choices = question.choices
      .map((choice) => {
        let classes = "review-choice";
        if (choice.id === question.correctChoiceId) classes += " correct";
        else if (choice.id === question.studentChoiceId) classes += " wrong-pick";
        const marker =
          choice.id === question.studentChoiceId && choice.id !== question.correctChoiceId
            ? " ← اختيارك"
            : choice.id === question.correctChoiceId
              ? " ← الإجابة الصحيحة"
              : "";
        return `<div class="${classes}">${escapeHtml(choice.text)}${marker}</div>`;
      })
      .join("");
    return `<div class="review-question">
      <div class="q-text">${question.wasCorrect ? "✅" : "❌"} ${escapeHtml(question.text)}</div>
      ${choices}
    </div>`;
  }

  return `<div class="review-question">
    <div class="q-text">✍️ ${escapeHtml(question.text)}</div>
    <div class="written-compare">
      <div class="written-box student"><h5>إجابتك</h5>${escapeHtml(question.studentAnswer || "—")}</div>
      <div class="written-box model"><h5>الإجابة النموذجية</h5>${escapeHtml(question.modelAnswer)}</div>
    </div>
  </div>`;
}

/* =====================================================================
 * COURSE CUMULATIVE LEADERBOARD (hub section)
 * ===================================================================== */

async function loadCourseLeaderboard() {
  const body = document.getElementById("course-leaderboard-body");
  const { ok, data } = await api(
    "GET",
    `/api/courses/${COURSE_ID}/leaderboard`
  );

  if (!ok) {
    body.innerHTML = '<p class="muted">تعذر تحميل لوحة الكورس.</p>';
    return;
  }

  let pendingNote = "";
  if (data.pendingQuizzes && data.pendingQuizzes.length > 0) {
    pendingNote = `<div class="locked-note" style="margin-bottom:.75rem;">
      ⏳ ${data.pendingQuizzes.length} اختبار لسه شغال — درجاته تُضاف بعد انتهاء وقته:
      ${data.pendingQuizzes.map((quiz) => escapeHtml(quiz.title)).join("، ")}</div>`;
  }
  body.innerHTML =
    pendingNote +
    (data.rankings.length === 0
      ? '<p class="muted">لا توجد درجات بعد.</p>'
      : leaderboardTable(data.rankings));
}

/* =====================================================================
 * FULLSCREEN EXIT HANDLER
 * ===================================================================== */

function setupFullscreenHandler() {
  document.addEventListener("fullscreenchange", () => {
    const runOverlay = document.getElementById("quiz-run-overlay");

    // Toggle .exam-fullscreen layout class to switch between the
    // small overlay (normal) and the dedicated fullscreen layout.
    if (document.fullscreenElement && document.fullscreenElement === runOverlay) {
      runOverlay.classList.add("exam-fullscreen");
      runState.inFullscreen = true;
    } else if (runOverlay) {
      runOverlay.classList.remove("exam-fullscreen");
      runState.inFullscreen = false;
    }

    if (!document.fullscreenElement && runState.quizId) {
      // User exited fullscreen while a quiz is active
      runState.fullscreenExitCount++;
      showToast(
        "⚠️ يجب البقاء في وضع ملء الشاشة أثناء الامتحان (خروج من ملء الشاشة: " +
          runState.fullscreenExitCount +
          ")",
        "warning"
      );
      // Log to console for teacher review (multiple exits indicate cheating)
      console.warn(
        `[QUIZ INTEGRITY] Student exited fullscreen ${runState.fullscreenExitCount} time(s) during quiz ${runState.quizId}`
      );
      // Attempt to re-enter fullscreen
      if (runOverlay && runOverlay.requestFullscreen) {
        setTimeout(() => {
          runOverlay.requestFullscreen().catch(() => {
            // User may have disabled fullscreen re-request; allow to continue
          });
        }, 500);
      }
    }
  });
}

/* =====================================================================
 * BOOTSTRAP & EVENTS
 * ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const hasToken = Boolean(getToken());
  document.getElementById("exams-login-gate").style.display = hasToken
    ? "none"
    : "";
  document.getElementById("exams-app").style.display = hasToken ? "" : "none";
  if (!hasToken) return;

  document.getElementById("exams-subtitle").textContent =
    getRole() === "teacher"
      ? "أنتِ مسجلة كمعلمة — هذه الصفحة تعرض ما يراه الطلاب."
      : "كل اختبارات الكورس في مكان واحد: القادمة، الجارية، والمنتهية مع النتائج والترتيب.";

  loadHub();
  loadCourseLeaderboard();
  setupFullscreenHandler();

  document.querySelectorAll(".exam-tab").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });

  document.body.addEventListener("click", (event) => {
    const takeButton = event.target.closest(".btn-take");
    if (takeButton) {
      const card = takeButton.closest(".exam-card");
      const title = card.querySelector(".exam-title").textContent;
      beginQuiz(takeButton.dataset.id, title);
      return;
    }
    const resultButton = event.target.closest(".btn-result");
    if (resultButton) openResult(resultButton.dataset.id, null);
  });

  document.getElementById("btn-submit-quiz").addEventListener("click", () => {
    if (confirm("هل تريدين تسليم الاختبار الآن؟")) submitQuiz(false);
  });
  document.getElementById("btn-close-run").addEventListener("click", closeRun);
  document
    .getElementById("btn-close-result")
    .addEventListener("click", () => {
      document.getElementById("quiz-result-overlay").style.display = "none";
    });
});
