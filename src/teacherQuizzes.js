/**
 * teacherQuizzes.js
 * ---------------------------------------------------------------------------
 * Teacher-side quiz builder, loaded only by dashboard-teacher.html.
 *
 * Talks to the existing backend:
 *   POST /api/quizzes                        create quiz shell (+notify)
 *   POST /api/quizzes/:id/questions          add one question (multipart)
 *
 * DATE/TIME PICKING: flatpickr (the established vanilla-JS picker - this
 * project is plain JS + Vite, not React). enableTime gives a combined
 * calendar + clock; we send `selectedDates[0].toISOString()` so the value
 * is an unambiguous UTC instant and can never be shifted by a timezone bug
 * on the way to the server.
 */

import flatpickr from "flatpickr";
import { Arabic } from "flatpickr/dist/l10n/ar.js";
import "flatpickr/dist/flatpickr.min.css";

const API = "";

/* ---------------- shared helpers ---------------- */

function getToken() {
  return localStorage.getItem("token");
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
    /* ignore */
  }
  return { ok: res.ok, status: res.status, data };
}

function toast(message, kind = "info", ms = 4000) {
  // Reuse main.js's showToast when present; otherwise a quick alert-style
  // fallback keeps this module self-contained for the teacher dashboard.
  if (typeof window.showToast === "function") return window.showToast(message, kind);
  alert(message);
}

/* ---------------- flatpickr instances ---------------- */

let startPicker;
let endPicker;

function initPickers() {
  const commonOptions = {
    enableTime: true,        // combined date + time in one picker
    time_24hr: false,        // teacher-friendly AM/PM clock
    minuteIncrement: 5,
    dateFormat: "Y-m-d H:i",
    altInput: true,          // pretty localized text box...
    altFormat: "j F, H:i K", // ...e.g. "٢٤ أغسطس، ٥:٣٠ م"
    locale: Arabic,
    disableMobile: true,     // consistent UI everywhere
  };
  startPicker = flatpickr("#quiz-start", {
    ...commonOptions,
    defaultDate: new Date(Date.now() + 60 * 60 * 1000), // in one hour
  });
  endPicker = flatpickr("#quiz-end", {
    ...commonOptions,
    defaultDate: new Date(Date.now() + 3 * 60 * 60 * 1000),
  });

  // Keep end after start whenever start changes.
  startPicker.config.onChange.push((selectedDates) => {
    if (selectedDates[0] && endPicker.selectedDates[0] < selectedDates[0]) {
      endPicker.setDate(
        new Date(selectedDates[0].getTime() + 2 * 60 * 60 * 1000)
      );
    }
  });
}

/** ISO string or null from a picker. */
function pickerIso(picker) {
  return picker && picker.selectedDates[0]
    ? picker.selectedDates[0].toISOString()
    : null;
}

/* ---------------- lesson select (from curriculum.js) ---------------- */

function populateLessonSelect() {
  const select = document.getElementById("quiz-lesson");
  if (!select) return;
  select.innerHTML = "";

  const curriculum =
    window.CURRICULUM && window.CURRICULUM.biology
      ? window.CURRICULUM.biology
      : [];

  for (const chapter of curriculum) {
    for (const lesson of chapter.lessons || []) {
      const option = document.createElement("option");
      option.value = lesson.id;
      option.textContent = `${chapter.name.split(":")[0]} — ${lesson.name}`;
      select.appendChild(option);
    }
  }
  if (!curriculum.length) {
    const option = document.createElement("option");
    option.value = "lesson-1";
    option.textContent = "lesson-1";
    select.appendChild(option);
  }
}

/* ---------------- question builder state ---------------- */

/** Questions staged before publishing. Images kept as File objects until
 *  publish time (single multipart POST per question at the end). */
let stagedQuestions = [];

function readBuilderForm() {
  const type = document.getElementById("question-type").value;
  const text = document.getElementById("question-text").value.trim();

  if (!text) return { error: "اكتبي نص السؤال." };

  const result = { type, text };

  if (type === "mcq") {
    const choices = [
      document.getElementById("choice-1").value.trim(),
      document.getElementById("choice-2").value.trim(),
      document.getElementById("choice-3").value.trim(),
      document.getElementById("choice-4").value.trim(),
    ];
    if (choices.some((choice) => !choice)) {
      return { error: "املئي الاختيارات الأربعة." };
    }
    const correctIndex = Number(
      document.querySelector('input[name="correct-choice"]:checked')?.value
    );
    if (!Number.isInteger(correctIndex)) {
      return { error: "اختاري الإجابة الصحيحة بالضغط على الدائرة أمامها." };
    }
    Object.assign(result, { choices, correctIndex });
  } else {
    const modelAnswer = document.getElementById("model-answer").value.trim();
    if (!modelAnswer) return { error: "اكتبي الإجابة النموذجية." };
    result.modelAnswer = modelAnswer;
  }

  const imageInput = document.getElementById("question-image");
  if (imageInput.files[0]) result.imageFile = imageInput.files[0];

  return { fields: result };
}

function renderStagedQuestions() {
  const list = document.getElementById("staged-questions");
  list.innerHTML = stagedQuestions
    .map(
      (question, index) => `
    <div class="staged-card" data-index="${index}">
      ${
        question.imagePreviewUrl
          ? `<img src="${question.imagePreviewUrl}" class="staged-thumb" alt="">`
          : ""
      }
      <div style="flex:1;">
        <b>${index + 1}. ${escapeHtml(question.text)}</b>
        <span class="badge">${question.type === "mcq" ? "اختيارات" : "مقالي"}</span>
        <div class="muted" style="font-size:.82rem;">${
          question.type === "mcq"
            ? question.choices
                .map(
                  (choice, choiceIndex) =>
                    `${choiceIndex === question.correctIndex ? "✔" : ""}${choice}`
                )
                .join(" | ")
            : `النموذجي: ${question.modelAnswer}`
        }</div>
      </div>
      <div>
        <button class="btn btn-secondary btn-sm" data-move="up" data-index="${index}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn-secondary btn-sm" data-move="down" data-index="${index}" ${index === stagedQuestions.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn btn-danger btn-sm" data-remove="${index}">✕</button>
      </div>
    </div>`
    )
    .join("");
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value == null ? "" : value);
  return div.innerHTML;
}

/* ---------------- publish ---------------- */

async function publishQuiz() {
  const title = document.getElementById("quiz-title").value.trim();
  const duration = Number(document.getElementById("quiz-duration").value);
  const startTime = pickerIso(startPicker);
  const endTime = pickerIso(endPicker);

  if (!title) return toast("اكتبي عنوان الاختبار.", "warning");
  if (!startTime || !endTime) return toast("حددي وقت البداية والنهاية من التقويم.", "warning");
  if (!Number.isFinite(duration) || duration <= 0)
    return toast("حددي مدة الحل بالدقائق.", "warning");
  if (stagedQuestions.length === 0)
    return toast("أضيفي سؤالاً واحداً على الأقل قبل النشر.", "warning");

  const button = document.getElementById("btn-publish-quiz");
  button.disabled = true;

  try {
    const created = await api("POST", "/api/quizzes", {
      lessonId: document.getElementById("quiz-lesson").value,
      courseId: "biology",
      title,
      questionCount: stagedQuestions.length,
      startTime,           // ISO UTC - no timezone shifting possible
      endTime,
      durationMinutes: duration,
    });

    if (!created.ok) {
      throw new Error(created.data?.error || "فشل إنشاء الاختبار.");
    }

    const quizId = created.data.quiz.id;

    // Sequential upload keeps order stable and shows live progress.
    for (let index = 0; index < stagedQuestions.length; index += 1) {
      const question = stagedQuestions[index];
      document.getElementById(
        "publish-progress"
      ).textContent = `جارٍ رفع السؤال ${index + 1} من ${stagedQuestions.length}…`;

      const form = new FormData();
      form.append("type", question.type);
      form.append("text", question.text);
      if (question.type === "mcq") {
        question.choices.forEach((choice, choiceIndex) =>
          form.append(`choice${choiceIndex + 1}`, choice)
        );
        form.append("correctIndex", String(question.correctIndex));
      } else {
        form.append("modelAnswer", question.modelAnswer);
      }
      if (question.imageFile) {
        form.append("image", question.imageFile, question.imageFile.name);
      }

      const added = await fetch(`${API}/api/quizzes/${quizId}/questions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      if (!added.ok) {
        const err = await added.json().catch(() => ({}));
        throw new Error(err.error || `فشل حفظ السؤال ${index + 1}.`);
      }
    }

    toast("تم نشر الاختبار وإشعار الطالبات ✅", "success");
    resetBuilder();
  } catch (error) {
    toast(error.message, "danger");
  } finally {
    button.disabled = false;
    document.getElementById("publish-progress").textContent = "";
  }
}

function resetBuilder() {
  stagedQuestions = [];
  renderStagedQuestions();
  document.getElementById("quiz-title").value = "";
  document.getElementById("quiz-duration").value = "20";
  document.getElementById("question-text").value = "";
  ["choice-1", "choice-2", "choice-3", "choice-4"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("model-answer").value = "";
  document.getElementById("question-image").value = "";
  document.getElementById("image-preview").style.display = "none";
  const correct = document.querySelector('input[name="correct-choice"]');
  if (correct) correct.checked = true;
}

/* ---------------- bootstrap ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  const mount = document.getElementById("teacher-quiz-builder");
  if (!mount) return; // not the teacher dashboard

  if (String(localStorage.getItem("userRole") || "").toLowerCase() !== "teacher") {
    mount.style.display = "none";
    return;
  }

  initPickers();
  populateLessonSelect();
  renderStagedQuestions();

  // MCQ <-> Written toggle swaps which fields are visible.
  document.getElementById("question-type").addEventListener("change", (event) => {
    const isMcq = event.target.value === "mcq";
    document.getElementById("mcq-fields").style.display = isMcq ? "" : "none";
    document.getElementById("written-fields").style.display = isMcq ? "none" : "";
  });

  // Image preview right after choosing a file (works for JPG/PNG/WEBP -
  // browsers decode all of them natively in an <img>).
  document.getElementById("question-image").addEventListener("change", (event) => {
    const preview = document.getElementById("image-preview");
    const file = event.target.files[0];
    if (!file) {
      preview.style.display = "none";
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.style.display = "";
  });

  // Stage a question from the form.
  document.getElementById("btn-stage-question").addEventListener("click", () => {
    const parsed = readBuilderForm();
    if (parsed.error) return toast(parsed.error, "warning");

    const fields = parsed.fields;
    if (fields.imageFile) {
      fields.imagePreviewUrl = URL.createObjectURL(fields.imageFile);
    }
    stagedQuestions.push(fields);
    renderStagedQuestions();

    // Clear inputs for the next question.
    document.getElementById("question-text").value = "";
    ["choice-1", "choice-2", "choice-3", "choice-4"].forEach((id) => {
      document.getElementById(id).value = "";
    });
    document.getElementById("model-answer").value = "";
    const imageInput = document.getElementById("question-image");
    imageInput.value = "";
    document.getElementById("image-preview").style.display = "none";
    toast("تمت إضافة السؤال للقائمة ✅", "success", 2000);
  });

  // Reorder / remove inside the staged list.
  document.getElementById("staged-questions").addEventListener("click", (event) => {
    const moveButton = event.target.closest("[data-move]");
    if (moveButton) {
      const index = Number(moveButton.dataset.index);
      const target = moveButton.dataset.move === "up" ? index - 1 : index + 1;
      [stagedQuestions[index], stagedQuestions[target]] = [
        stagedQuestions[target],
        stagedQuestions[index],
      ];
      renderStagedQuestions();
      return;
    }
    const removeButton = event.target.closest("[data-remove]");
    if (removeButton) {
      stagedQuestions.splice(Number(removeButton.dataset.remove), 1);
      renderStagedQuestions();
    }
  });

  document.getElementById("btn-publish-quiz").addEventListener("click", publishQuiz);
});
