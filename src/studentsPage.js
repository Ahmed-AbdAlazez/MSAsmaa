import { skeletonLines, skeletonError } from "./components/skeleton.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export function initStudentsPage({ API_BASE, authHeaders, fetchJson, showToast }) {
  const list = document.querySelector("#approved-students-list");
  const count = document.querySelector("#approved-students-count");
  const searchInput = document.querySelector("#approved-students-search");
  const pagination = document.querySelector("#approved-students-pagination");
  let students = [];
  let page = 1;
  let pageInfo = { page: 1, totalPages: 0, total: 0 };
  let searchTimer;
  let updatingId = "";
  let activeRecordId = "";

  const formatDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(date)
      : "—";
  };

  const formatDateTime = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date)
      : "—";
  };

  const renderStudents = () => {
    list.replaceChildren();
    pagination.replaceChildren();
    if (!students.length) {
      const empty = document.createElement("p");
      empty.className = "text-muted";
      empty.textContent = "لا يوجد طلاب مقبولون أو غير نشطين حاليًا.";
      list.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML =
      "<thead><tr><th>الطالب</th><th>كود الطالب</th><th>Gmail</th><th>تاريخ الانضمام</th><th>الحالة</th><th>الإجراءات</th></tr></thead>";
    const body = document.createElement("tbody");
    students.forEach((student) => {
      const row = document.createElement("tr");

      const nameCell = document.createElement("td");
      const nameLink = document.createElement("button");
      nameLink.type = "button";
      nameLink.className = "btn btn-link btn-sm";
      nameLink.style.cssText = "padding:0; font-weight:600; color:var(--color-primary); text-align:start;";
      nameLink.textContent = student.name || "—";
      nameLink.title = "عرض سجل الطالب (الدرجات والأخطاء)";
      nameLink.addEventListener("click", () => openStudentRecord(student));
      nameCell.appendChild(nameLink);
      row.appendChild(nameCell);

      [student.studentCode || "—", student.email || "—", formatDate(student.createdAt)].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });

      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = student.status === "REJECTED" ? "badge badge-danger" : "badge badge-success";
      status.textContent = student.status === "REJECTED" ? "غير نشط" : "نشط";
      statusCell.appendChild(status);
      row.appendChild(statusCell);

      const actions = document.createElement("td");
      actions.style.cssText = "display:flex; gap:.5rem; flex-wrap:wrap; align-items:center;";

      const recordButton = document.createElement("button");
      recordButton.type = "button";
      recordButton.className = activeRecordId === student.id ? "btn btn-primary" : "btn btn-secondary";
      recordButton.style.cssText = "font-size:.8rem; padding:.35rem .75rem;";
      recordButton.textContent = activeRecordId === student.id ? "جارٍ التحميل..." : "📊 سجل الطالب";
      recordButton.disabled = Boolean(activeRecordId);
      recordButton.addEventListener("click", () => openStudentRecord(student, recordButton));
      actions.appendChild(recordButton);

      const targetStatus = student.status === "APPROVED" ? "REJECTED" : student.status === "REJECTED" ? "APPROVED" : null;
      if (targetStatus) {
        const statusButton = document.createElement("button");
        statusButton.type = "button";
        statusButton.className = targetStatus === "REJECTED" ? "btn btn-danger" : "btn btn-primary";
        statusButton.style.cssText = "font-size:.8rem; padding:.35rem .75rem;";
        statusButton.textContent = updatingId === student.id ? "Updating..." : targetStatus === "REJECTED" ? "Disactive" : "Active";
        statusButton.disabled = Boolean(updatingId);
        statusButton.addEventListener("click", () => updateStudentStatus(student, targetStatus));
        actions.appendChild(statusButton);
      }
      row.appendChild(actions);
      body.appendChild(row);
    });
    table.appendChild(body);
    const wrapper = document.createElement("div");
    wrapper.className = "table-responsive";
    wrapper.appendChild(table);
    list.appendChild(wrapper);

    if (pageInfo.totalPages > 1) {
      const previous = document.createElement("button");
      previous.type = "button";
      previous.className = "btn btn-light";
      previous.textContent = "السابق";
      previous.disabled = page <= 1;
      previous.addEventListener("click", () => loadStudents(page - 1));
      const label = document.createElement("span");
      label.className = "text-muted";
      label.textContent = `صفحة ${pageInfo.page} من ${pageInfo.totalPages}`;
      const next = document.createElement("button");
      next.type = "button";
      next.className = "btn btn-light";
      next.textContent = "التالي";
      next.disabled = page >= pageInfo.totalPages;
      next.addEventListener("click", () => loadStudents(page + 1));
      pagination.append(previous, label, next);
    }
  };

  const loadCount = async () => {
    const data = await fetchJson(`${API_BASE}/students/count`, { headers: authHeaders() });
    count.textContent = String(data?.data?.count ?? 0);
  };

  const loadStudents = async (requestedPage = 1) => {
    list.innerHTML = skeletonLines(5);
    try {
      const params = new URLSearchParams({ page: String(requestedPage), limit: "50" });
      const query = String(searchInput.value || "").trim();
      if (query) params.set("search", query);
      const data = await fetchJson(`${API_BASE}/students?${params.toString()}`, { headers: authHeaders() });
      students = Array.isArray(data?.data?.students) ? data.data.students : [];
      pageInfo = data?.data?.pagination || pageInfo;
      page = pageInfo.page || requestedPage;
      if (!students.length && page > 1 && pageInfo.total > 0) return loadStudents(page - 1);
      renderStudents();
    } catch (error) {
      students = [];
      list.innerHTML = skeletonError("تعذر تحميل الطلاب، حاولي مرة أخرى.", "إعادة المحاولة");
      list.querySelector(".skeleton-retry-btn")?.addEventListener("click", () => loadStudents());
      pagination.replaceChildren();
      showToast(error.message, "danger");
    }
  };

  const updateStudentStatus = async (student, targetStatus) => {
    if (updatingId) return;
    const isDeactivating = targetStatus === "REJECTED";
    const confirmed = await window.showConfirmModal?.(
      isDeactivating ? "Are you sure you want to deactivate this student?" : "Are you sure you want to activate this student?",
      { isDestructive: isDeactivating, confirmText: isDeactivating ? "Disactive" : "Active", cancelText: "Cancel" },
    );
    if (!confirmed) return;
    updatingId = student.id;
    renderStudents();
    try {
      const data = await fetchJson(`${API_BASE}/students/${encodeURIComponent(student.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status: targetStatus }),
      });
      const updatedStudent = data?.data?.student;
      if (updatedStudent?.id === student.id) {
        students = students.map((current) => current.id === student.id ? updatedStudent : current);
      }
      updatingId = "";
      renderStudents();
      loadCount().catch(() => {});
      showToast(isDeactivating ? "Student deactivated successfully." : "Student activated successfully.", "success");
    } catch (error) {
      updatingId = "";
      renderStudents();
      showToast(error.message, "danger");
    }
  };

  const closeRecordModal = (overlay) => {
    if (!overlay) return;
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  };

  /** Full student record: every exam grade + every mistake, teacher-owned only. */
  const openStudentRecord = async (student, button) => {
    window.ensureModalStyles?.();
    activeRecordId = student.id;
    if (button) {
      button.disabled = true;
      button.textContent = "جارٍ التحميل...";
      button.classList.remove("btn-secondary");
      button.classList.add("btn-primary");
    } else {
      renderStudents();
    }

    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.style.cssText = "align-items:center; justify-content:center;";
    overlay.innerHTML = `
      <div class="custom-modal-panel" style="width:min(860px,94vw); max-width:94vw; max-height:86vh; height:auto; display:flex; flex-direction:column; overflow:hidden; padding:0;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; padding:1.1rem 1.4rem; border-bottom:1px solid var(--color-border); flex-wrap:wrap;">
          <div style="min-width:0;">
            <h3 style="margin:0; font-size:1.05rem;">📊 سجل الطالب: ${escapeHtml(student.name || "—")}</h3>
            <div class="text-muted" style="font-size:.82rem; margin-top:.25rem;">
              ${escapeHtml(student.studentCode || "")}${student.email ? ` · ${escapeHtml(student.email)}` : ""}
            </div>
          </div>
          <button type="button" class="custom-modal-btn custom-modal-btn-cancel student-record-close" style="padding:.35rem .8rem; font-size:.85rem;">✕ إغلاق</button>
        </div>
        <div class="student-record-body" style="overflow-y:auto; padding:1.25rem 1.4rem; display:flex; flex-direction:column; gap:1.4rem;">
          <p class="text-muted" style="margin:0;">جارٍ تحميل سجل الطالب...</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    const closeBtn = overlay.querySelector(".student-record-close");
    const dismiss = () => closeRecordModal(overlay);
    closeBtn.addEventListener("click", dismiss);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) dismiss();
    });
    document.addEventListener("keydown", onKey);
    function onKey(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        dismiss();
      }
    }

    const bodyHolder = overlay.querySelector(".student-record-body");
    try {
      const data = await fetchJson(`${API_BASE}/students/${encodeURIComponent(student.id)}/performance`, { headers: authHeaders() });
      const record = data?.data;
      renderRecord(record, bodyHolder);
    } catch (error) {
      bodyHolder.innerHTML = `<div class="skeleton-error">${escapeHtml(error.message)}</div>`;
      showToast(error.message, "danger");
    } finally {
      activeRecordId = "";
      if (button) {
        button.disabled = false;
        button.textContent = "📊 سجل الطالب";
        button.classList.remove("btn-primary");
        button.classList.add("btn-secondary");
      } else {
        renderStudents();
      }
    }
  };

  const renderRecord = (record, holder) => {
    const grades = Array.isArray(record?.grades) ? record.grades : [];
    const mistakes = Array.isArray(record?.mistakes) ? record.mistakes : [];

    const gradesHtml = grades.length
      ? `<div class="table-responsive">
          <table class="table" style="font-size:.85rem;">
            <thead><tr><th>الاختبار</th><th>المحاولة</th><th>الدرجة</th><th>النسبة</th><th>التسليم</th></tr></thead>
          <tbody>
          ${grades.map((g) => `
            <tr>
              <td style="font-weight:600;">${escapeHtml(g.quizTitle)}</td>
              <td>${escapeHtml(String(g.attemptNumber))}</td>
              <td>${g.status === "submitted" ? `${escapeHtml(String(g.score ?? 0))} / ${escapeHtml(String(g.totalMcq ?? 0))}` : '<span class="badge badge-warning">جارية</span>'}</td>
              <td>${g.percent === null ? "—" : `<span class="badge ${g.percent >= 50 ? "badge-success" : "badge-danger"}">${escapeHtml(String(g.percent))}%</span>`}</td>
              <td>${formatDateTime(g.submittedAt)}</td>
            </tr>`).join("")}
          </tbody>
          </table>
          <p class="text-muted" style="font-size:.78rem; margin:.4rem 0 0;">${record.ownedQuizCount ?? 0} اختبار ضمن هذا السجل (المحاولات المحفوظة تظهر جميعها).</p>
        </div>`
      : '<div class="mistakes-empty" style="color:var(--color-text-muted);">لا توجد نتائج اختبارات محفوظة لهذا الطالب بعد.</div>';

    const mistakesHtml = mistakes.length
      ? mistakes.map((mistake) => `
          <article class="mistake-card" style="padding:.9rem 1rem;">
            <p class="mistake-exam" style="margin:.2rem 0 .4rem; font-size:.8rem; color:var(--color-text-muted);">الاختبار: <strong>${escapeHtml(mistake.quizTitle)}</strong></p>
            <h2 style="font-size:1rem; line-height:1.6; margin:0 0 .6rem;">${escapeHtml(mistake.questionText)}</h2>
            <div class="mistake-answer wrong"><span>❌ إجابتها</span><strong>${escapeHtml(mistake.studentAnswer || "لم تتم الإجابة")}</strong></div>
            <div class="mistake-answer correct"><span>✅ الإجابة الصحيحة</span><strong>${escapeHtml(mistake.correctAnswer)}</strong></div>
            <time style="font-size:.78rem;">${escapeHtml(formatDate(mistake.createdAt))}</time>
          </article>`).join("")
      : '<div class="mistakes-empty" style="color:var(--color-text-muted);">ممتاز! لا توجد أخطاء مسجلة لهذا الطالب 🎉</div>';

    holder.innerHTML = `
      <section>
        <h4 style="margin:0 0 .75rem; font-size:.95rem;">📝 النتائج</h4>
        ${gradesHtml}
      </section>
      <section>
        <h4 style="margin:0 0 .75rem; font-size:.95rem;">❌ الأخطاء</h4>
        <div style="display:flex; flex-direction:column; gap:1rem;">${mistakesHtml}</div>
      </section>`;
  };

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadStudents(1), 250);
  });
  Promise.all([loadCount(), loadStudents()]).catch(() => {});
}