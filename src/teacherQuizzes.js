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

/* Scoped element lookup.
 * All builder controls live inside #teacher-quiz-builder. Resolving ids
 * against this section (instead of the whole document) makes the builder
 * immune to id collisions with other page scripts - e.g. main.js injects
 * a legacy quiz panel that also contains an id="quiz-title" input, which
 * previously stole getElementById("quiz-title") and made publish see an
 * empty title even though the teacher had typed one. */
let scope = document;
const byId = (id) => scope.querySelector(`#${id}`);

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
let windowPreview;

/** Arabic wall-clock rendering of an instant ("٢٥ أغسطس، ٤:٠٧ م"). */
function formatLocalArabic(date) {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch (_) {
    return date.toLocaleString();
  }
}

/** Shows exactly when the quiz opens/closes for students, and warns when
 *  the start is still in the future (the #1 "why is it locked?" cause). */
function updateWindowPreview() {
  if (!windowPreview) return;
  const start = startPicker && startPicker.selectedDates[0];
  const end = endPicker && endPicker.selectedDates[0];
  if (!start || !end) {
    windowPreview.innerHTML = "";
    return;
  }
  const startsLater = start.getTime() > Date.now();
  windowPreview.innerHTML =
    `⏰ يفتح الاختبار للطالبات: <b>${formatLocalArabic(start)}</b> — ويُغلق: <b>${formatLocalArabic(end)}</b>` +
    (startsLater
      ? `<br><span class="badge">⚠️ وقت البدء في المستقبل — الطالبات لا يرين لوحة الترتيب أو المراجعة إلا بعد وقت النهاية.</span>`
      : "");
}

function initPickers() {
  // Default start = the next 5-minute mark (i.e. NOW), NOT +1h — teachers
  // who publish without touching the clock expect the quiz to be live.
  const roundedStart = new Date(
    Math.ceil(Date.now() / (5 * 60 * 1000)) * 5 * 60 * 1000
  );
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
    defaultDate: roundedStart,
  });
  endPicker = flatpickr("#quiz-end", {
    ...commonOptions,
    defaultDate: new Date(roundedStart.getTime() + 2 * 60 * 60 * 1000),
  });

  // Keep end after start whenever start changes.
  startPicker.config.onChange.push((selectedDates) => {
    if (selectedDates[0] && endPicker.selectedDates[0] < selectedDates[0]) {
      endPicker.setDate(
        new Date(selectedDates[0].getTime() + 2 * 60 * 60 * 1000)
      );
    }
    updateWindowPreview();
  });
  endPicker.config.onChange.push(updateWindowPreview);

  // Preview lives right under the end-time field (created here so the
  // builder stays a drop-in without extra HTML edits).
  windowPreview = document.createElement("p");
  windowPreview.className = "muted";
  windowPreview.style.fontSize = "0.85rem";
  const endHost = byId("quiz-end");
  const host = endHost.parentElement || document.body;
  host.insertBefore(windowPreview, endHost.nextSibling);
  updateWindowPreview();
}

/** ISO string or null from a picker. */
function pickerIso(picker) {
  return picker && picker.selectedDates[0]
    ? picker.selectedDates[0].toISOString()
    : null;
}

/* ---------------- lesson select (from curriculum.js) ---------------- */

function populateLessonSelect() {
  const select = byId("quiz-lesson");
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

/** Populate the mixed-quiz lesson checkboxes (same curriculum, with chapter labels). */
function populateMixedLessonCheckboxes() {
  const container = byId("quiz-lessons-checkboxes");
  if (!container) return;
  container.innerHTML = "";

  const curriculum =
    window.CURRICULUM && window.CURRICULUM.biology
      ? window.CURRICULUM.biology
      : [];

  for (const chapter of curriculum) {
    for (const lesson of chapter.lessons || []) {
      const label = document.createElement("label");
      label.style.cssText = "display:flex; align-items:center; gap:.4rem; padding:.25rem 0; cursor:pointer; font-weight:500; font-size:.9rem;";
      label.innerHTML = `<input type="checkbox" value="${lesson.id}" class="mixed-lesson-check"> ${chapter.name.split(":")[0]} — ${lesson.name}`;
      container.appendChild(label);
    }
  }
}

/** Toggle between single-lesson and mixed-lesson UI. */
function setupQuizTypeToggle() {
  const radios = document.querySelectorAll('input[name="quiz-type"]');
  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      const isMixed = radio.value === "mixed" && radio.checked;
      byId("single-lesson-label").style.display = isMixed ? "none" : "";
      byId("mixed-lessons-label").style.display = isMixed ? "" : "none";
    });
  });
}

/* ---------------- question builder state ---------------- */

/** Questions staged before publishing. Images kept as File objects until
 *  publish time (single multipart POST per question at the end). */
let stagedQuestions = [];

function readBuilderForm() {
  const type = byId("question-type").value;
  const text = byId("question-text").value.trim();

  if (!text) return { error: "اكتبي نص السؤال." };

  const result = { type, text };

  if (type === "mcq") {
    const choices = [
      byId("choice-1").value.trim(),
      byId("choice-2").value.trim(),
      byId("choice-3").value.trim(),
      byId("choice-4").value.trim(),
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
    const modelAnswer = byId("model-answer").value.trim();
    if (!modelAnswer) return { error: "اكتبي الإجابة النموذجية." };
    result.modelAnswer = modelAnswer;
  }

  const imageInput = byId("question-image");
  if (imageInput.files[0]) result.imageFile = imageInput.files[0];

  return { fields: result };
}

function renderStagedQuestions() {
  const list = byId("staged-questions");
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
  const title = byId("builder-quiz-title").value.trim();
  const duration = Number(byId("quiz-duration").value);
  const startTime = pickerIso(startPicker);
  const endTime = pickerIso(endPicker);
  const isMixed = document.querySelector('input[name="quiz-type"]:checked')?.value === "mixed";

  if (!title) return toast("اكتبي عنوان الاختبار.", "warning");
  if (!startTime || !endTime) return toast("حددي وقت البداية والنهاية من التقويم.", "warning");
  if (!Number.isFinite(duration) || duration <= 0)
    return toast("حددي مدة الحل بالدقائق.", "warning");
  if (stagedQuestions.length === 0)
    return toast("أضيفي سؤالاً واحداً على الأقل قبل النشر.", "warning");

  const body = {
    isMixed,
    title,
    courseId: "biology",
    questionCount: stagedQuestions.length,
    startTime,
    endTime,
    durationMinutes: duration,
  };

  if (isMixed) {
    const checked = [...document.querySelectorAll(".mixed-lesson-check:checked")];
    if (checked.length < 2) {
      return toast("اختاري درسين على الأقل للاختبار المجمع.", "warning");
    }
    body.lessonIds = checked.map((cb) => cb.value);
  } else {
    const lessonId = byId("quiz-lesson").value;
    if (!lessonId) return toast("اختاري الدرس.", "warning");
    body.lessonId = lessonId;
  }

  const button = byId("btn-publish-quiz");
  button.disabled = true;

  try {
    const created = await api("POST", "/api/quizzes", body);

    if (!created.ok) {
      throw new Error(created.data?.error || "فشل إنشاء الاختبار.");
    }

    const quizId = created.data.quiz.id;

    // Sequential upload keeps order stable and shows live progress.
    for (let index = 0; index < stagedQuestions.length; index += 1) {
      const question = stagedQuestions[index];
      byId(
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
    byId("publish-progress").textContent = "";
  }
}

function resetBuilder() {
  stagedQuestions = [];
  renderStagedQuestions();
  byId("builder-quiz-title").value = "";
  byId("quiz-duration").value = "20";
  byId("question-text").value = "";
  ["choice-1", "choice-2", "choice-3", "choice-4"].forEach((id) => {
    byId(id).value = "";
  });
  byId("model-answer").value = "";
  byId("question-image").value = "";
  byId("image-preview").style.display = "none";
  const correct = document.querySelector('input[name="correct-choice"]');
  if (correct) correct.checked = true;
}

/* ---------------- bootstrap ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  const mount = document.getElementById("teacher-quiz-builder");
  if (!mount) return; // not the teacher dashboard

  scope = mount; // all byId() lookups are scoped to this section

  if (String(localStorage.getItem("userRole") || "").toLowerCase() !== "teacher") {
    mount.style.display = "none";
    return;
  }

  initPickers();
  populateLessonSelect();
  populateMixedLessonCheckboxes();
  setupQuizTypeToggle();
  renderStagedQuestions();

  // MCQ <-> Written toggle swaps which fields are visible.
  byId("question-type").addEventListener("change", (event) => {
    const isMcq = event.target.value === "mcq";
    byId("mcq-fields").style.display = isMcq ? "" : "none";
    byId("written-fields").style.display = isMcq ? "none" : "";
  });

  // Image preview right after choosing a file (works for JPG/PNG/WEBP -
  // browsers decode all of them natively in an <img>).
  byId("question-image").addEventListener("change", (event) => {
    const preview = byId("image-preview");
    const file = event.target.files[0];
    if (!file) {
      preview.style.display = "none";
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.style.display = "";
  });

  // Stage a question from the form.
  byId("btn-stage-question").addEventListener("click", () => {
    const parsed = readBuilderForm();
    if (parsed.error) return toast(parsed.error, "warning");

    const fields = parsed.fields;
    if (fields.imageFile) {
      fields.imagePreviewUrl = URL.createObjectURL(fields.imageFile);
    }
    stagedQuestions.push(fields);
    renderStagedQuestions();

    // Clear inputs for the next question.
    byId("question-text").value = "";
    ["choice-1", "choice-2", "choice-3", "choice-4"].forEach((id) => {
      byId(id).value = "";
    });
    byId("model-answer").value = "";
    const imageInput = byId("question-image");
    imageInput.value = "";
    byId("image-preview").style.display = "none";
    toast("تمت إضافة السؤال للقائمة ✅", "success", 2000);
  });

  // Reorder / remove inside the staged list.
  byId("staged-questions").addEventListener("click", (event) => {
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

  byId("btn-publish-quiz").addEventListener("click", publishQuiz);
});
