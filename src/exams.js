/**
 * exams.js
 * ---------------------------------------------------------------------------
 * Student-facing Exams Hub. Talks ONLY to the already-built quiz backend:
 *
 *   GET  /api/quizzes/available                     hub feed (server status)
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
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
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

  const action =
    exam.status === "active"
      ? `<button class="btn btn-primary btn-take" data-id="${exam.id}">ابدئي الحل</button>`
      : exam.status === "ended"
        ? `<button class="btn btn-secondary btn-result" data-id="${exam.id}">النتيجة والمراجعة</button>`
        : `<span class="muted">تبدأ ${formatDateTime(exam.startTime)}</span>`;

  return `
  <article class="exam-card" data-exam-id="${exam.id}">
    <div class="exam-card-top">
      <div class="exam-title">${escapeHtml(exam.title)}</div>
      <span class="exam-status ${exam.status}">${STATUS_LABELS[exam.status]}</span>
    </div>
    <div class="exam-meta">
      <span>📘 ${escapeHtml(lessonName || exam.lessonId)}</span>
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

  // Flat chronological view (soonest first).
  all.innerHTML =
    exams.length === 0
      ? '<p class="muted">لا توجد اختبارات متاحة حالياً.</p>'
      : `<div class="exam-grid">${exams.map(examCardHtml).join("")}</div>`;

  // Grouped-by-lesson view.
  const groups = new Map();
  for (const exam of exams) {
    if (!groups.has(exam.lessonId)) groups.set(exam.lessonId, []);
    groups.get(exam.lessonId).push(exam);
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
}

async function loadHub() {
  const { ok, status, data } = await api("GET", "/api/quizzes/available");
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
  answers: {}, // questionId -> value (client mirror for the final flush)
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

function questionBlockHtml(question, savedValue) {
  if (question.type === "mcq") {
    const choices = question.choices
      .map((choice) => {
        const checked = savedValue === choice.id ? "checked" : "";
        return `<label class="choice-row">
                  <input type="radio" name="q-${question.id}" value="${choice.id}" data-qid="${question.id}" class="mcq-choice" ${checked}>
                  <span>${escapeHtml(choice.text)}</span>
                </label>`;
      })
      .join("");
    const image = question.imageUrl
      ? `<img class="question-image" src="${question.imageUrl}" alt="صورة السؤال">`
      : "";
    return `<div class="question-block" data-question="${question.id}">
              ${image}
              <div class="q-text">${escapeHtml(question.text)}</div>
              ${choices}
            </div>`;
  }

  // written
  const image = question.imageUrl
    ? `<img class="question-image" src="${question.imageUrl}" alt="صورة السؤال">`
    : "";
  return `<div class="question-block" data-question="${question.id}">
            ${image}
            <div class="q-text">${escapeHtml(question.text)}</div>
            <textarea class="written-answer" data-qid="${question.id}"
              placeholder="اكتبي إجابتك هنا…">${escapeHtml(savedValue || "")}</textarea>
          </div>`;
}

function openRun(payload, quizTitle, quizId) {
  runState.quizId = quizId;
  runState.attemptId = payload.attemptId;
  runState.answers = { ...(payload.savedAnswers || {}) };

  document.getElementById("run-title").textContent = quizTitle;
  document.getElementById("run-meta").textContent =
    payload.status === "resumed"
      ? `أكملتي محاولتك السابقة — الوقت المتبقي ${Math.ceil(payload.remainingSeconds / 60)} دقيقة`
      : `المدة ${payload.durationMinutes} دقيقة — بالتوفيق!`;

  document.getElementById("run-questions").innerHTML = payload.questions
    .map((question) =>
      questionBlockHtml(question, (payload.savedAnswers || {})[question.id])
    )
    .join("");

  document.getElementById("quiz-run-overlay").style.display = "flex";
  startTimer(payload.remainingSeconds);

  // Autosave on EVERY change so an interrupted session resumes pre-filled.
  document.getElementById("run-questions").onchange = async (event) => {
    const target = event.target;
    const questionId = target.dataset.qid;
    if (!questionId) return;
    const value = target.type === "radio" ? target.value : target.value;
    runState.answers[questionId] = value;
    const save = await api("POST", `/api/quizzes/${runState.quizId}/answers`, {
      questionId,
      value,
    });
    if (save.status === 409 && save.data && save.data.result) {
      // Server says time is up - it already auto-submitted us.
      showToast(save.data.error, "warning");
      closeRun();
      openResult(runState.quizIdForLookup || runState.quizId, save.data.result.resultId);
    }
  };
}

function closeRun() {
  stopTimer();
  document.getElementById("quiz-run-overlay").style.display = "none";
}

async function beginQuiz(quizId, quizTitle) {
  const { ok, status, data } = await api(
    "POST",
    `/api/quizzes/${quizId}/start`
  );

  if (!ok) {
    showToast(data && data.error ? data.error : "تعذر بدء الاختبار.", "danger");
    return;
  }

  if (data.status === "auto_submitted") {
    // Their personal countdown expired while away.
    showToast("انتهى وقت المحاولة وتم التسليم التلقائي.", "warning");
    openResult(quizId, data.result.resultId);
    return;
  }

  runState.quizIdForLookup = quizId;
  openRun({ ...data }, quizTitle, quizId);
}

async function submitQuiz(auto = false) {
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
  openResult(runState.quizId, data.result.resultId);
}

/* =====================================================================
 * RESULT VIEW: score banner + THIS quiz's leaderboard + gated review
 * ===================================================================== */

async function openResult(quizId, resultId) {
  document.getElementById("quiz-result-overlay").style.display = "flex";

  const summary = document.getElementById("result-summary");
  const lbBody = document.getElementById("quiz-leaderboard-body");
  const reviewBody = document.getElementById("review-body");

  // Opening an ENDED exam from the hub has no resultId yet - ask the
  // backend for this student's latest submitted attempt first.
  if (!resultId) {
    const attempt = await api("GET", `/api/quizzes/${quizId}/attempt`);
    if (attempt.ok && attempt.data.result) {
      resultId = attempt.data.result.resultId;
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
  summary.innerHTML = `<div class="score-banner">درجتك: ${r.score} من ${r.totalMcq}
    <span class="muted" style="font-weight:400;">(أسئلة الاختيارات فقط)</span></div>`;
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
