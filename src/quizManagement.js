/**
 * quizManagement.js
 * ---------------------------------------------------------------------------
 * Teacher interface to view, edit, and delete existing quizzes and questions.
 * Loaded only by dashboard-teacher.html after the quiz builder.
 *
 * Features:
 * - Filter by lesson (chapter → lesson cascade) or show all mixed quizzes
 * - Click to view quiz details and all questions
 * - Edit questions (text, answers, correct choice) - before start time only
 * - Delete individual questions - before start time only
 * - Delete entire quiz - any time
 * - Visual indicators for "can edit" status based on time
 */

const API = "";

/* ----------------------- Helpers ----------------------- */
function getToken() {
  return localStorage.getItem("token");
}

async function apiCall(method, path, body) {
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

function showToast(message, kind = "info", ms = 3000) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), ms);
}

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value == null ? "" : value);
  return div.innerHTML;
}

/** Resolve a lesson ID to its Arabic name from the global curriculum. */
function resolveLessonName(lessonId) {
  if (!lessonId || !window.CURRICULUM) return lessonId || "";
  for (const chapter of window.CURRICULUM.biology || []) {
    const found = (chapter.lessons || []).find((l) => l.id === lessonId);
    if (found) return found.name;
  }
  return lessonId;
}

/** Resolve a lesson ID to "Chapter — Lesson" label. */
function resolveLessonLabel(lessonId) {
  if (!lessonId || !window.CURRICULUM) return lessonId || "";
  for (const chapter of window.CURRICULUM.biology || []) {
    const found = (chapter.lessons || []).find((l) => l.id === lessonId);
    if (found) return `${chapter.name.split(":")[0]} — ${found.name}`;
  }
  return lessonId;
}

/* ----------------------- State ----------------------- */
let quizzesState = [];
let selectedQuizId = null;
let selectedQuiz = null;
let currentFilterMode = "by-lesson"; // "by-lesson" | "mixed"

/* ----------------------- API Calls ----------------------- */

async function loadTeacherQuizzes() {
  const { ok, data } = await apiCall("GET", "/api/quizzes-managed");
  if (!ok) {
    showToast("تعذر تحميل الاختبارات.", "danger");
    return false;
  }
  quizzesState = data.quizzes || [];
  return true;
}

async function loadQuizDetails(quizId) {
  const { ok, data } = await apiCall("GET", `/api/quizzes/${quizId}/full`);
  if (!ok) {
    showToast("تعذر تحميل تفاصيل الاختبار.", "danger");
    return false;
  }
  selectedQuizId = quizId;
  selectedQuiz = data;
  renderQuizDetails();
  return true;
}

async function deleteQuestion(quizId, questionId) {
  if (!confirm("هل تريدين حذف هذا السؤال؟")) return;

  const { ok, data } = await apiCall(
    "DELETE",
    `/api/quizzes/${quizId}/questions/${questionId}`
  );

  if (!ok) {
    showToast(data?.error || "تعذر حذف السؤال.", "danger");
    return false;
  }

  showToast("تم حذف السؤال بنجاح.", "success");
  await loadQuizDetails(quizId);
  return true;
}

async function deleteEntireQuiz(quizId) {
  if (!confirm("هل تريدين حذف هذا الاختبار بالكامل؟ لا يمكن التراجع عن هذا!")) {
    return;
  }

  const { ok, data } = await apiCall("DELETE", `/api/quizzes/${quizId}`);

  if (!ok) {
    showToast(data?.error || "تعذر حذف الاختبار.", "danger");
    return false;
  }

  showToast("تم حذف الاختبار بنجاح.", "success");
  selectedQuizId = null;
  selectedQuiz = null;
  await loadTeacherQuizzes();
  applyFilter();
  return true;
}

async function updateQuestion(quizId, questionId, updates) {
  const { ok, data } = await apiCall(
    "PUT",
    `/api/quizzes/${quizId}/questions/${questionId}`,
    updates
  );

  if (!ok) {
    showToast(data?.error || "تعذر تحديث السؤال.", "danger");
    return false;
  }

  showToast("تم تحديث السؤال بنجاح.", "success");
  await loadQuizDetails(quizId);
  return true;
}

async function updateQuizSettings(quizId, payload) {
  const { ok, data } = await apiCall("PUT", `/api/quizzes/${quizId}`, payload);

  if (!ok) {
    showToast(data?.error || "تعذر تحديث إعدادات الاختبار.", "danger");
    return false;
  }

  showToast("تم تحديث إعدادات الاختبار بنجاح.", "success");
  await loadTeacherQuizzes();
  await loadQuizDetails(quizId);
  return true;
}

/* ----------------------- Filter Mode & Chapter/Lesson Cascade ----------------------- */

function populateFilterLessonSelect(chapterIdx) {
  const chapterSelect = document.getElementById("quiz-mgmt-chapter");
  const lessonSelect = document.getElementById("quiz-mgmt-lesson");
  if (!chapterSelect || !lessonSelect) return;

  // If called without argument, read current value
  if (chapterIdx == null) chapterIdx = Number(chapterSelect.value) || 0;

  const curriculum = window.CURRICULUM && window.CURRICULUM.biology
    ? window.CURRICULUM.biology : [];

  // Populate chapters
  if (chapterSelect.options.length !== curriculum.length) {
    chapterSelect.innerHTML = "";
    curriculum.forEach((chapter, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = chapter.name;
      chapterSelect.appendChild(opt);
    });
    chapterSelect.value = String(chapterIdx);
  }

  // Populate lessons for selected chapter
  const chapter = curriculum[chapterIdx];
  if (!chapter) return;
  lessonSelect.innerHTML = "";
  for (const lesson of chapter.lessons || []) {
    const opt = document.createElement("option");
    opt.value = lesson.id;
    opt.textContent = `${lesson.name} (${lesson.id})`;
    lessonSelect.appendChild(opt);
  }
}

/** Apply the current filter mode and render the quiz list. */
function applyFilter() {
  const lessonListContainer = document.getElementById("quiz-management-list");
  if (!lessonListContainer) return;

  if (currentFilterMode === "mixed") {
    // Show only mixed quizzes
    const mixedQuizzes = quizzesState.filter((q) => q.isMixed);
    renderFilteredQuizzes(mixedQuizzes);
  } else {
    // Show only single-lesson quizzes for the selected lesson
    const lessonSelect = document.getElementById("quiz-mgmt-lesson");
    const selectedLessonId = lessonSelect ? lessonSelect.value : null;
    if (!selectedLessonId) {
      lessonListContainer.innerHTML = `<p class="muted">اختاري الدرس لعرض الاختبارات.</p>`;
      return;
    }
    const filtered = quizzesState.filter(
      (q) => !q.isMixed && q.lessonId === selectedLessonId
    );
    renderFilteredQuizzes(filtered);
  }
}

/** Render quiz cards into the list container. */
function renderFilteredQuizzes(quizzes) {
  const container = document.getElementById("quiz-management-list");
  if (!container) return;

  if (quizzes.length === 0) {
    container.innerHTML = `<p class="muted">لا توجد اختبارات تطابق التصفية الحالية.</p>`;
    return;
  }

  container.innerHTML = quizzes
    .map((quiz) => {
      // Lesson line for mixed quizzes: show covered lesson names
      let lessonLine = "";
      if (quiz.isMixed && quiz.lessonIds && quiz.lessonIds.length) {
        const names = quiz.lessonIds.map((lid) => resolveLessonName(lid));
        lessonLine = ` <span style="font-size:0.85rem; color:var(--color-primary);">(يشمل: ${names.join(" | ")})</span>`;
      } else if (quiz.lessonId) {
        lessonLine = ` <span class="muted">${escapeHtml(resolveLessonName(quiz.lessonId))}</span>`;
      }

      return `
      <div class="quiz-management-card" data-quiz-id="${quiz.id}">
        <div class="quiz-card-header">
          <div>
            <h3>${escapeHtml(quiz.title)}${quiz.isMixed ? ' <span style="font-size:0.8rem; background:var(--color-accent); color:white; padding:0.1rem 0.4rem; border-radius:4px; vertical-align:middle;">مجمع</span>' : ""}</h3>
            <p class="muted">${quiz.questionCount} سؤال • ${formatDate(quiz.startTime)}${lessonLine}</p>
          </div>
          <span class="quiz-status-badge ${quiz.canEdit ? "editable" : "locked"}">
            ${quiz.canEdit ? "قابل للتعديل" : "مغلق"}
          </span>
        </div>
        <div class="quiz-card-actions">
          <button class="btn btn-primary btn-sm view-quiz" data-quiz-id="${quiz.id}">
            عرض التفاصيل
          </button>
          ${
            quiz.canEdit
              ? `<button class="btn btn-secondary btn-sm settings-quiz" data-quiz-id="${quiz.id}">
                   ⚙️ تعديل الإعدادات
                 </button>`
              : ""
          }
          <button class="btn btn-danger btn-sm delete-quiz" data-quiz-id="${quiz.id}">
            حذف الاختبار
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  // Attach event listeners
  container.querySelectorAll(".view-quiz").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await loadQuizDetails(btn.dataset.quizId);
      renderMainView();
    });
  });

  container.querySelectorAll(".delete-quiz").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteEntireQuiz(btn.dataset.quizId);
    });
  });

  container.querySelectorAll(".settings-quiz").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const quiz = quizzesState.find((q) => q.id === btn.dataset.quizId);
      if (quiz) showEditSettingsModal(quiz);
    });
  });
}

function setupFilterModeToggle() {
  const buttons = document.querySelectorAll(".quiz-filter-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (mode === currentFilterMode) return;
      currentFilterMode = mode;

      // Toggle active class
      buttons.forEach((b) => {
        b.classList.toggle("active", b.dataset.mode === mode);
        b.classList.toggle("btn-primary", b.dataset.mode === mode);
        b.classList.toggle("btn-secondary", b.dataset.mode !== mode);
      });

      // Toggle controls visibility
      const byLessonControls = document.getElementById("quiz-by-lesson-controls");
      const mixedInfo = document.getElementById("quiz-mixed-info");
      if (byLessonControls) byLessonControls.style.display = mode === "by-lesson" ? "flex" : "none";
      if (mixedInfo) mixedInfo.style.display = mode === "mixed" ? "block" : "none";

      // Re-render
      selectedQuizId = null;
      selectedQuiz = null;
      renderMainView();
      applyFilter();
    });
  });
}

/* ----------------------- UI Rendering ----------------------- */

function renderQuizDetails() {
  if (!selectedQuiz) return;

  const { quiz, questions } = selectedQuiz;
  const canEdit = quiz.canEdit;

  const container = document.getElementById("quiz-management-details");
  if (!container) return;

  // Lesson info line
  let lessonInfo = "";
  if (quiz.isMixed && quiz.lessonIds && quiz.lessonIds.length) {
    const names = quiz.lessonIds.map((lid) => resolveLessonLabel(lid));
    lessonInfo = `<br>يشمل الدرس: ${names.join(" | ")}`;
  } else if (quiz.lessonId) {
    lessonInfo = `<br>الدرس: ${escapeHtml(resolveLessonLabel(quiz.lessonId))}`;
  }

  container.innerHTML = `
    <div class="quiz-details-header">
      <button class="btn btn-secondary" id="back-to-list">← العودة</button>
      <div>
        <h2>${escapeHtml(quiz.title)}${quiz.isMixed ? ' <span style="font-size:0.8rem; background:var(--color-accent); color:white; padding:0.1rem 0.4rem; border-radius:4px; vertical-align:middle;">مجمع</span>' : ""}</h2>
        <p class="muted">
          من ${formatDate(quiz.startTime)} إلى ${formatDate(quiz.endTime)}<br>
          المدة: ${quiz.durationMinutes} دقيقة | ${questions.length} سؤال
          ${lessonInfo}
        </p>
      </div>
      <div class="quiz-details-actions">
        ${
          canEdit
            ? `<button class="btn btn-secondary" id="edit-settings">⚙️ تعديل الإعدادات</button>`
            : ""
        }
        <button class="btn btn-danger delete-entire-quiz" data-quiz-id="${quiz.id}">
          🗑️ حذف الاختبار
        </button>
      </div>
    </div>

    <div class="questions-editor">
      ${questions
        .map(
          (q, idx) => `
        <div class="question-edit-block ${canEdit ? "editable" : "locked"}">
          <div class="question-header">
            <span class="question-number">السؤال ${idx + 1} (${q.type === "mcq" ? "اختيارات" : "مقالي"})</span>
            ${!canEdit ? '<span class="lock-badge">🔒 مغلق</span>' : ""}
          </div>

          <div class="question-preview">
            <p><strong>نص السؤال:</strong> ${escapeHtml(q.text)}</p>
            ${q.imageUrl ? `<img src="${q.imageUrl}" class="question-preview-image" alt="" style="max-width:300px; border-radius:6px; margin-top:0.5rem; cursor:pointer;" onclick="window.open('${q.imageUrl}','_blank')">` : ""}

            ${
              q.type === "mcq"
                ? `
              <div class="choices-preview">
                <strong>الخيارات:</strong>
                <ul>
                  ${q.choices
                    .map(
                      (c) => `
                    <li class="${c.id === q.correctChoiceId ? "correct" : ""}">
                      ${escapeHtml(c.text)}
                      ${c.id === q.correctChoiceId ? " ✓ (الإجابة الصحيحة)" : ""}
                    </li>
                  `
                    )
                    .join("")}
                </ul>
              </div>
            `
                : `
              <div class="model-answer-preview">
                <strong>الإجابة النموذجية:</strong>
                <p>${escapeHtml(q.modelAnswer)}</p>
              </div>
            `
            }
          </div>

          ${
            canEdit
              ? `
            <div class="question-actions">
              <button class="btn btn-secondary btn-sm edit-question" data-q-id="${q.id}">
                ✏️ تعديل
              </button>
              <button class="btn btn-danger btn-sm delete-question" data-q-id="${q.id}">
                🗑️ حذف
              </button>
            </div>
          `
              : '<p class="muted" style="font-size: 0.9rem;">لا يمكن تعديل الأسئلة بعد بدء الاختبار.</p>'
          }
        </div>
      `
        )
        .join("")}
    </div>
  `;

  // Add event listeners
  document.getElementById("back-to-list")?.addEventListener("click", () => {
    selectedQuizId = null;
    selectedQuiz = null;
    renderMainView();
  });

  document.querySelector(".delete-entire-quiz")?.addEventListener("click", async (e) => {
    await deleteEntireQuiz(e.target.dataset.quizId);
  });

  document.getElementById("edit-settings")?.addEventListener("click", () => {
    showEditSettingsModal(quiz);
  });

  container.querySelectorAll(".delete-question").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteQuestion(quiz.id, btn.dataset.qId);
    });
  });

  container.querySelectorAll(".edit-question").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const question = questions.find((q) => q.id === btn.dataset.qId);
      if (question) {
        showEditQuestionModal(quiz.id, question);
      }
    });
  });
}

/** ISO instant -> "YYYY-MM-DDTHH:mm" in the TEACHER'S local clock so a
 *  datetime-local input shows exactly what she picked originally. */
function isoToLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function lessonOptionsHtml(selectedLessonId) {
  const curriculum =
    window.CURRICULUM && window.CURRICULUM.biology
      ? window.CURRICULUM.biology
      : [];
  const options = [];
  for (const chapter of curriculum) {
    for (const lesson of chapter.lessons || []) {
      const value = escapeHtml(lesson.id);
      const label = `${chapter.name.split(":")[0]} — ${escapeHtml(lesson.name)}`;
      options.push(
        `<option value="${value}" ${lesson.id === selectedLessonId ? "selected" : ""}>${label}</option>`
      );
    }
  }
  if (!options.length) {
    return `<option value="lesson-1">lesson-1</option>`;
  }
  return options.join("");
}

/**
 * Edit ALL quiz settings (title / lesson / window / duration / question
 * count). Only offered while the quiz has NOT started; the server enforces
 * the same rule.
 */
function showEditSettingsModal(quiz) {
  let modal = document.getElementById("edit-settings-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "edit-settings-modal";
    modal.className = "modal";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>تعديل إعدادات الاختبار</h3>
        <button class="modal-close">&times;</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label>عنوان الاختبار</label>
          <input type="text" class="form-input" id="settings-title"
                 value="${escapeHtml(quiz.title)}">
        </div>

        ${
          quiz.isMixed
            ? `<div class="form-group">
                 <label>الدروس المشمولة</label>
                 <p class="muted">${(quiz.lessonIds || []).map(resolveLessonLabel).join(" | ")}</p>
               </div>`
            : `<div class="form-group">
                 <label>الدرس</label>
                 <select class="form-input" id="settings-lesson">
                   ${lessonOptionsHtml(quiz.lessonId)}
                 </select>
               </div>`
        }

        <div class="form-group">
          <label>وقت البدء</label>
          <input type="datetime-local" class="form-input" id="settings-start"
                 value="${isoToLocalInputValue(quiz.startTime)}">
        </div>

        <div class="form-group">
          <label>وقت النهاية</label>
          <input type="datetime-local" class="form-input" id="settings-end"
                 value="${isoToLocalInputValue(quiz.endTime)}">
        </div>

        <div class="form-group">
          <label>مدة الحل بالدقائق</label>
          <input type="number" min="1" step="1" class="form-input" id="settings-duration"
                 value="${escapeHtml(String(quiz.durationMinutes))}">
        </div>

        <p class="muted" style="font-size:.85rem;">
          ⏰ يفتح الاختبار للطالبات في وقت البدء، وتظهر لوحة الترتيب والمراجعة بعد وقت النهاية.
        </p>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary modal-close-btn">إلغاء</button>
        <button class="btn btn-primary" id="save-settings-edit">حفظ التغييرات</button>
      </div>
    </div>
  `;

  modal.style.display = "flex";

  const close = () => {
    modal.style.display = "none";
  };
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector(".modal-close-btn").addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector("#save-settings-edit").addEventListener("click", async () => {
    const title = modal.querySelector("#settings-title").value.trim();
    const startRaw = modal.querySelector("#settings-start").value;
    const endRaw = modal.querySelector("#settings-end").value;
    const duration = Number(modal.querySelector("#settings-duration").value);

    const payload = { title, durationMinutes: duration };

    // Only send lessonId if this is a single-lesson quiz
    if (!quiz.isMixed) {
      const lessonEl = modal.querySelector("#settings-lesson");
      if (lessonEl) payload.lessonId = lessonEl.value;
    }

    if (!title) return showToast("عنوان الاختبار مطلوب.", "warning");
    if (!startRaw || !endRaw) return showToast("حددي وقتي البداية والنهاية.", "warning");
    const startTime = new Date(startRaw);
    const endTime = new Date(endRaw);
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime())) {
      return showToast("وقت البداية أو النهاية غير صالح.", "warning");
    }
    if (endTime <= startTime) {
      return showToast("وقت النهاية يجب أن يكون بعد وقت البدء.", "warning");
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      return showToast("حددي مدة الحل بالدقائق.", "warning");
    }

    payload.startTime = startTime.toISOString();
    payload.endTime = endTime.toISOString();

    const success = await updateQuizSettings(quiz.id, payload);
    if (success) close();
  });
}

function showEditQuestionModal(quizId, question) {
  let editModal = document.getElementById("edit-question-modal");
  if (!editModal) {
    editModal = document.createElement("div");
    editModal.id = "edit-question-modal";
    editModal.className = "modal";
    document.body.appendChild(editModal);
  }

  const choicesHtml =
    question.type === "mcq"
      ? `
    <div class="form-group">
      <label>الخيارات</label>
      ${question.choices
        .map(
          (c, idx) => `
        <div class="choice-input-group">
          <input type="text" class="form-input choice-text" value="${escapeHtml(c.text)}" placeholder="الخيار ${idx + 1}">
          <label>
            <input type="radio" name="correct-choice" value="${c.id}" ${c.id === question.correctChoiceId ? "checked" : ""}>
            الإجابة الصحيحة
          </label>
        </div>
      `
        )
        .join("")}
    </div>
  `
      : `
    <div class="form-group">
      <label>الإجابة النموذجية</label>
      <textarea class="form-input" id="model-answer" rows="4">${escapeHtml(question.modelAnswer || "")}</textarea>
    </div>
  `;

  editModal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>تعديل السؤال</h3>
        <button class="modal-close">&times;</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label>نص السؤال</label>
          <textarea class="form-input" id="question-text" rows="3">${escapeHtml(question.text)}</textarea>
        </div>

        ${choicesHtml}
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary modal-close-btn">إلغاء</button>
        <button class="btn btn-primary" id="save-question-edit">حفظ التغييرات</button>
      </div>
    </div>
  `;

  editModal.style.display = "flex";

  editModal.querySelector(".modal-close").addEventListener("click", () => {
    editModal.style.display = "none";
  });

  editModal.querySelector(".modal-close-btn").addEventListener("click", () => {
    editModal.style.display = "none";
  });

  editModal.querySelector("#save-question-edit").addEventListener("click", async () => {
    const updates = {
      text: document.getElementById("question-text").value.trim(),
    };

    if (question.type === "mcq") {
      const choices = Array.from(editModal.querySelectorAll(".choice-text")).map((el) =>
        el.value.trim()
      );
      const correctChoiceId = editModal.querySelector('input[name="correct-choice"]:checked')
        ?.value;
      updates.choices = choices;
      updates.correctChoiceId = correctChoiceId;
    } else {
      updates.modelAnswer = document.getElementById("model-answer").value.trim();
    }

    if (!updates.text) {
      showToast("نص السؤال مطلوب.", "warning");
      return;
    }

    const success = await updateQuestion(quizId, question.id, updates);
    if (success) {
      editModal.style.display = "none";
    }
  });

  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) {
      editModal.style.display = "none";
    }
  });
}

function renderMainView() {
  const detailsContainer = document.getElementById("quiz-management-details");
  const listContainer = document.getElementById("quiz-management-list");

  if (selectedQuiz) {
    if (listContainer) listContainer.style.display = "none";
    if (detailsContainer) {
      detailsContainer.style.display = "block";
      renderQuizDetails();
    }
  } else {
    if (detailsContainer) detailsContainer.style.display = "none";
    if (listContainer) listContainer.style.display = "block";
    applyFilter();
  }
}

/* ----------------------- Init ----------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  // Only run if on teacher dashboard
  if (!document.querySelector("#quiz-management-panel")) return;

  // Populate chapter/lesson dropdowns
  populateFilterLessonSelect(0);

  // Wire up chapter change to repopulate lessons
  const chapterSelect = document.getElementById("quiz-mgmt-chapter");
  if (chapterSelect) {
    chapterSelect.addEventListener("change", () => {
      populateFilterLessonSelect(Number(chapterSelect.value));
    });
  }

  // Wire up "load" button for by-lesson mode
  const loadBtn = document.getElementById("btn-load-mgmt-quizzes");
  if (loadBtn) {
    loadBtn.addEventListener("click", () => applyFilter());
  }

  // Also re-filter when lesson changes (immediate feedback)
  const lessonSelect = document.getElementById("quiz-mgmt-lesson");
  if (lessonSelect) {
    lessonSelect.addEventListener("change", () => applyFilter());
  }

  // Setup filter mode toggle buttons
  setupFilterModeToggle();

  // Load all quizzes from API
  await loadTeacherQuizzes();
  applyFilter();
});

export { loadTeacherQuizzes, loadQuizDetails };
