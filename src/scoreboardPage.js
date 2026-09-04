import { skeletonLines, skeletonError } from "./components/skeleton.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export { escapeHtml };

const MEDALS = {
  1: { icon: "🥇", label: "المركز الأول" },
  2: { icon: "🥈", label: "المركز الثاني" },
  3: { icon: "🥉", label: "المركز الثالث" },
};

function fmtPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${Number(value).toFixed(1)}%`;
}

function rankBadge(rank) {
  if (rank === 1) return '<span class="scoreboard-rank scoreboard-rank-1">1</span>';
  if (rank === 2) return '<span class="scoreboard-rank scoreboard-rank-2">2</span>';
  if (rank === 3) return '<span class="scoreboard-rank scoreboard-rank-3">3</span>';
  return `<span class="scoreboard-rank">${escapeHtml(String(rank))}</span>`;
}

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date)
    : "—";
};

/**
 * Teacher-only Student Scoreboard.
 *
 * The authoritative access gate is the backend: /api/v1/students/scoreboard
 * lives on a router mounted behind (protect, restrictTo('TEACHER')), so any
 * student who calls it (or this page's URL) directly receives a 403 Forbidden
 * before any data is returned. The client-side role check in scoreboard.html
 * is only defense-in-depth.
 */
export function initScoreboardPage({ API_BASE, authHeaders, fetchJson, showToast }) {
  const list = document.querySelector("#scoreboard-list");
  const podium = document.querySelector("#scoreboard-podium");
  const emptyEl = document.querySelector("#scoreboard-empty");
  const countEl = document.querySelector("#scoreboard-count");
  const searchInput = document.querySelector("#scoreboard-search");
  const sortSelect = document.querySelector("#scoreboard-sort");

  if (!list) return;

  let students = [];
  let searchTimer;

  const closeModal = (overlay) => {
    if (!overlay) return;
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  };

  const getFilteredSorted = () => {
    const query = String(searchInput?.value || "").trim().toLowerCase();
    let result = students;
    if (query) {
      result = result.filter(
        (s) =>
          (s.name || "").toLowerCase().includes(query) ||
          String(s.studentCode || "").toLowerCase().includes(query),
      );
    }
    const mode = sortSelect?.value || "rank";
    const copy = [...result];
    copy.sort((a, b) => {
      if (mode === "totalScore") return b.totalScore - a.totalScore;
      if (mode === "avgPercent") return (b.avgPercent ?? -1) - (a.avgPercent ?? -1);
      if (mode === "examsCompleted") return b.examsCompleted - a.examsCompleted;
      return a.rank - b.rank; // default: by rank
    });
    return copy;
  };

  const renderPodium = (rows) => {
    if (!podium) return;
    podium.replaceChildren();
    const top3 = rows.slice(0, 3);
    if (!top3.length) return;

    // Podium ordered visually as 2nd-1st-3rd (winner centered).
    const order = [top3[1], top3[0], top3[2]].filter(Boolean);
    order.forEach((row, idx) => {
      const medal = idx === 1 ? MEDALS[1] : idx === 0 ? MEDALS[2] : MEDALS[3];
      const card = document.createElement("div");
      card.className = `scoreboard-podium-card ${idx === 1 ? "scoreboard-podium-first" : ""}`;
      card.style.order = String(idx);
      card.innerHTML = `
        <div class="scoreboard-podium-medal">${medal.icon}</div>
        <div class="scoreboard-podium-rank">${medal.label}</div>
        <div class="scoreboard-podium-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</div>
        <div class="scoreboard-podium-score">${escapeHtml(String(row.totalScore))} نقطة</div>
        <div class="scoreboard-podium-percent">${fmtPercent(row.avgPercent)}</div>
      `;
      card.addEventListener("click", () => openDetail(row.studentId, row.name));
      podium.appendChild(card);
    });
  };

  const renderTable = () => {
    list.replaceChildren();
    const rows = getFilteredSorted();

    if (countEl) countEl.textContent = rows.length > 0 ? `${rows.length} طالب` : "";
    if (emptyEl) emptyEl.hidden = rows.length > 0;
    renderPodium(rows);

    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "text-muted";
      empty.textContent =
        students.length === 0
          ? "لا توجد بيانات أداء متاحة بعد."
          : "لا يوجد طالب يطابق البحث.";
      list.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "table scoreboard-table";
    table.innerHTML =
      "<thead><tr><th>المرتبة</th><th>الطالب</th><th>الاختبارات</th><th>مجموع الدرجات</th><th>النسبة الكلية</th><th>المتوسط</th><th>الأعلى</th><th>الأدنى</th><th></th></tr></thead>";
    const body = document.createElement("tbody");

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      if (row.rank === 1) tr.classList.add("scoreboard-podium-row-1");
      else if (row.rank === 2) tr.classList.add("scoreboard-podium-row-2");
      else if (row.rank === 3) tr.classList.add("scoreboard-podium-row-3");
      tr.innerHTML = `
        <td>${rankBadge(row.rank)}</td>
        <td>
          <button type="button" class="btn btn-link btn-sm scoreboard-student-name"
            data-id="${escapeHtml(String(row.studentId))}"
            data-name="${escapeHtml(row.name)}"
            style="padding:0; font-weight:600; color:var(--color-primary); text-align:start;">
            ${escapeHtml(row.name)}
          </button>
          <div class="text-muted scoreboard-student-code">${escapeHtml(row.studentCode || "")}</div>
        </td>
        <td>${escapeHtml(String(row.examsCompleted))}</td>
        <td><strong>${escapeHtml(String(row.totalScore))}</strong><span class="text-muted" style="font-size:.8rem;"> / ${escapeHtml(String(row.totalPossible))}</span></td>
        <td><span class="badge ${row.overallPercent >= 50 ? "badge-success" : "badge-danger"}">${fmtPercent(row.overallPercent)}</span></td>
        <td>${fmtPercent(row.avgPercent)}</td>
        <td>${fmtPercent(row.highest)}</td>
        <td>${fmtPercent(row.lowest)}</td>
        <td><button type="button" class="btn btn-secondary btn-sm scoreboard-detail-btn" data-id="${escapeHtml(String(row.studentId))}" data-name="${escapeHtml(row.name)}">التفاصيل</button></td>
      `;
      body.appendChild(tr);
    });

    table.appendChild(body);
    list.appendChild(table);

    list.querySelectorAll(".scoreboard-detail-btn, .scoreboard-student-name").forEach((btn) => {
      btn.addEventListener("click", () => openDetail(btn.dataset.id, btn.dataset.name));
    });
  };

  /**
   * Opens the per-student detail modal. Individual exam rows come from the
   * existing teacher-only performance endpoint (same ownership-scoped data the
   * Students page record modal uses) — we never duplicate grade storage.
   */
  const openDetail = async (studentId, studentName) => {
    window.ensureModalStyles?.();

    const source = students.find((s) => String(s.studentId) === String(studentId));
    if (!source) return;

    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.style.cssText = "align-items:center; justify-content:center;";
    overlay.innerHTML = `
      <div class="custom-modal-panel" style="width:min(820px,94vw); max-width:94vw; max-height:88vh; height:auto; display:flex; flex-direction:column; overflow:hidden; padding:0;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; padding:1.1rem 1.4rem; border-bottom:1px solid var(--color-border); flex-wrap:wrap;">
          <div style="min-width:0;">
            <h3 style="margin:0; font-size:1.05rem;">🏆 تفاصيل أداء: ${escapeHtml(studentName)}</h3>
            <span class="text-muted" style="font-size:.85rem;">المرتبة الحالية في الفصل: #${escapeHtml(String(source.rank))} · ${escapeHtml(source.studentCode || "")}</span>
          </div>
          <button type="button" class="custom-modal-btn custom-modal-btn-cancel scoreboard-detail-close" style="padding:.35rem .8rem; font-size:.85rem;">✕ إغلاق</button>
        </div>
        <div class="scoreboard-detail-body" style="overflow-y:auto; padding:1.25rem 1.4rem;">
          <div class="scoreboard-summary-cards" id="sb-summary-cards" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:.75rem; margin-bottom:1.25rem;"></div>
          <h4 style="margin:0 0 .75rem; font-size:.95rem;">📝 نتائج الاختبارات</h4>
          <div id="sb-per-exam"><p class="text-muted">جارٍ تحميل النتائج...</p></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    const closeBtn = overlay.querySelector(".scoreboard-detail-close");
    const dismiss = () => closeModal(overlay);
    closeBtn.addEventListener("click", dismiss);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) dismiss();
    });
    const onKey = (e) => {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        dismiss();
      }
    };
    document.addEventListener("keydown", onKey);

    const summaryCard = [
      { label: "عدد الاختبارات", value: String(source.examsCompleted) },
      { label: "مجموع الدرجات", value: `${source.totalScore} / ${source.totalPossible}` },
      { label: "النسبة الكلية", value: fmtPercent(source.overallPercent) },
      { label: "المتوسط", value: fmtPercent(source.avgPercent) },
      { label: "أعلى درجة", value: fmtPercent(source.highest) },
      { label: "أدنى درجة", value: fmtPercent(source.lowest) },
    ];
    overlay.querySelector("#sb-summary-cards").innerHTML = summaryCard
      .map(
        (item) => `
        <div class="scoreboard-summary-card">
          <div class="scoreboard-summary-label">${escapeHtml(item.label)}</div>
          <div class="scoreboard-summary-value">${item.value}</div>
        </div>`,
      )
      .join("");

    const examHolder = overlay.querySelector("#sb-per-exam");
    try {
      const resp = await fetchJson(
        `${API_BASE}/students/${encodeURIComponent(studentId)}/performance`,
        { headers: authHeaders() },
      );
      const grades = Array.isArray(resp?.data?.grades)
        ? resp.data.grades.filter((g) => g.status === "submitted")
        : [];

      if (grades.length) {
        examHolder.innerHTML = `
          <div class="table-responsive">
            <table class="table scoreboard-exam-table">
              <thead><tr><th>الاختبار</th><th>الدرجة</th><th>النسبة</th><th>التسليم</th></tr></thead>
              <tbody>
                ${grades
                  .map((g) => {
                    const pct = g.percent ?? null;
                    return `<tr>
                      <td style="font-weight:600;">${escapeHtml(g.quizTitle)}</td>
                      <td>${escapeHtml(String(g.score ?? 0))} / ${escapeHtml(String(g.totalMcq ?? 0))}</td>
                      <td><span class="badge ${pct !== null && pct >= 50 ? "badge-success" : "badge-danger"}">${fmtPercent(pct)}</span></td>
                      <td>${formatDateTime(g.submittedAt)}</td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>`;
      } else {
        examHolder.innerHTML = `<p class="text-muted">لا توجد نتائج اختبارات محفوظة لهذا الطالب بعد.</p>`;
      }
    } catch (error) {
      examHolder.innerHTML = `<p class="text-muted">${escapeHtml(error.message)}</p>`;
      showToast(error.message, "danger");
    }
  };

  const loadScoreboard = async () => {
    list.innerHTML = skeletonLines(6);
    try {
      const data = await fetchJson(`${API_BASE}/students/scoreboard`, {
        headers: authHeaders(),
      });
      students = Array.isArray(data?.data?.students)
        ? data.data.students
        : [];
      renderTable();
    } catch (error) {
      students = [];
      list.innerHTML = skeletonError(
        "تعذر تحميل لوحة الترتيب. حاولي مرة أخرى.",
        "إعادة المحاولة",
      );
      list.querySelector(".skeleton-retry-btn")?.addEventListener("click", loadScoreboard);
      if (emptyEl) emptyEl.hidden = true;
      showToast(error.message, "danger");
    }
  };

  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderTable, 200);
  });
  sortSelect?.addEventListener("change", renderTable);

  loadScoreboard();
}
