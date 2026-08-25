/**
 * quizManagement.js
 * ---------------------------------------------------------------------------
 * Teacher interface to view, edit, and delete existing quizzes and questions.
 * Loaded only by dashboard-teacher.html after the quiz builder.
 *
 * Features:
 * - List all quizzes created by the teacher
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

/* ----------------------- State ----------------------- */
let quizzesState = [];
let selectedQuizId = null;
let selectedQuiz = null;

/* ----------------------- API Calls ----------------------- */

async function loadTeacherQuizzes() {
  const { ok, data } = await apiCall("GET", "/api/quizzes-managed");
  if (!ok) {
    showToast("تعذر تحميل الاختبارات.", "danger");
    return false;
  }
  quizzesState = data.quizzes || [];
  renderQuizzesList();
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
  renderMainView();
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

/* ----------------------- UI Rendering ----------------------- */

function renderQuizzesList() {
  const container = document.getElementById("quiz-management-list");
  if (!container) return;

  if (quizzesState.length === 0) {
    container.innerHTML = `<p class="muted">لا توجد اختبارات حالياً.</p>`;
    return;
  }

  container.innerHTML = quizzesState
    .map(
      (quiz) => `
    <div class="quiz-management-card" data-quiz-id="${quiz.id}">
      <div class="quiz-card-header">
        <div>
          <h3>${escapeHtml(quiz.title)}</h3>
          <p class="muted">${quiz.questionCount} سؤال • ${formatDate(quiz.startTime)}</p>
        </div>
        <span class="quiz-status-badge ${quiz.canEdit ? "editable" : "locked"}">
          ${quiz.canEdit ? "قابل للتعديل" : "مغلق"}
        </span>
      </div>
      <div class="quiz-card-actions">
        <button class="btn btn-primary btn-sm view-quiz" data-quiz-id="${quiz.id}">
          عرض التفاصيل
        </button>
        <button class="btn btn-danger btn-sm delete-quiz" data-quiz-id="${quiz.id}">
          حذف الاختبار
        </button>
      </div>
    </div>
  `
    )
    .join("");

  // Add event listeners
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
}

function renderQuizDetails() {
  if (!selectedQuiz) return;

  const { quiz, questions } = selectedQuiz;
  const canEdit = quiz.canEdit;

  const container = document.getElementById("quiz-management-details");
  if (!container) return;

  container.innerHTML = `
    <div class="quiz-details-header">
      <button class="btn btn-secondary" id="back-to-list">← العودة</button>
      <div>
        <h2>${escapeHtml(quiz.title)}</h2>
        <p class="muted">
          من ${formatDate(quiz.startTime)} إلى ${formatDate(quiz.endTime)}<br>
          المدة: ${quiz.durationMinutes} دقيقة | ${questions.length} سؤال
        </p>
      </div>
      <button class="btn btn-danger delete-entire-quiz" data-quiz-id="${quiz.id}">
        🗑️ حذف الاختبار
      </button>
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
            ${q.imageUrl ? `<img src="${q.imageUrl}" class="question-preview-image" alt="">` : ""}

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

  document.querySelectorAll(".delete-question").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteQuestion(quiz.id, btn.dataset.qId);
    });
  });

  document.querySelectorAll(".edit-question").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const question = questions.find((q) => q.id === btn.dataset.qId);
      if (question) {
        showEditQuestionModal(quiz.id, question);
      }
    });
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

  // Event listeners
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

  // Close on outside click
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
    renderQuizzesList();
  }
}

/* ----------------------- Init ----------------------- */

document.addEventListener("DOMContentLoaded", () => {
  // Only run if on teacher dashboard
  if (!document.querySelector("#quiz-management-panel")) return;

  loadTeacherQuizzes();
});

export { loadTeacherQuizzes, loadQuizDetails };
