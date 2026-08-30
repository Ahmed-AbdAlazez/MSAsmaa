import { skeletonLines, skeletonError } from "./components/skeleton.js";

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

  const formatDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(date)
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
    table.innerHTML = "<thead><tr><th>الطالب</th><th>كود الطالب</th><th>Gmail</th><th>تاريخ الانضمام</th><th>الحالة</th><th>الإجراءات</th></tr></thead>";
    const body = document.createElement("tbody");
    students.forEach((student) => {
      const row = document.createElement("tr");
      [student.name || "—", student.studentCode || "—", student.email || "—", formatDate(student.createdAt)].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = student.status === "REJECTED" ? "badge badge-danger" : "badge badge-success";
      status.textContent = student.status || "APPROVED";
      statusCell.appendChild(status);
      row.appendChild(statusCell);

      const actions = document.createElement("td");
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

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadStudents(1), 250);
  });
  Promise.all([loadCount(), loadStudents()]).catch(() => {});
}
