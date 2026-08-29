import { initNavbar } from "./components/navbar.js";
import { initStudentsPage } from "./studentsPage.js";
import { initStudentMistakesPage } from "./studentMistakesPage.js";
import { skeletonRows, skeletonError } from "./components/skeleton.js";

// Keep every OPEN tab in sync with theme toggles made elsewhere: the
// 'storage' event fires only in other tabs/documents, so flipping dark
// mode on one page instantly updates all the others without a reload.
window.addEventListener("storage", (event) => {
  if (
    event.key === "theme" &&
    (event.newValue === "dark" || event.newValue === "light")
  ) {
    document.documentElement.setAttribute("data-theme", event.newValue);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const isStudentsPage = window.location.pathname.includes("students.html");
  const isTeacherOnlyPage =
    window.location.pathname.includes("registration-requests.html") ||
    window.location.pathname.includes("dashboard-teacher.html") ||
    isStudentsPage;
  if (isTeacherOnlyPage) {
    const role = String(localStorage.getItem("userRole") || "").toLowerCase();
    const token = localStorage.getItem("token");
    if (role !== "teacher" || !token) {
      window.location.replace(isStudentsPage ? "login.html" : "index.html");
      return;
    }
  }

  // --- Helper function to reinitialize navbar UI (called on initial load and after auth state changes) ---
  const reinitializeNavbarUI = () => {
    initNavbar();

    // --- Dark / light theme toggle ---
    const themeRoot = document.documentElement;
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next =
          themeRoot.getAttribute("data-theme") === "dark" ? "light" : "dark";
        themeRoot.setAttribute("data-theme", next);
        try {
          localStorage.setItem("theme", next);
        } catch (_) {
          /* storage unavailable — theme still applies for this visit */
        }
      });
    });

    // --- Mobile Drawer Menu ---
    const navToggle = document.querySelector(".nav-toggle");
    const drawerClose = document.querySelector(".mobile-drawer-close");
    const drawer = document.querySelector(".mobile-drawer");
    const overlay = document.querySelector(".drawer-overlay");

    if (navToggle && drawer && overlay) {
      navToggle.addEventListener("click", () => {
        drawer.classList.add("open");
        overlay.classList.add("show");
      });
    }

    const closeDrawer = () => {
      if (drawer && overlay) {
        drawer.classList.remove("open");
        overlay.classList.remove("show");
      }
    };

    if (drawerClose) drawerClose.addEventListener("click", closeDrawer);
    if (overlay) overlay.addEventListener("click", closeDrawer);
  };

  reinitializeNavbarUI();

  // --- Authentication (REAL BACKEND ONLY) ----------------------------------
  // Login/signup go to the real backend (VITE_API_URL). There are NO
  // hardcoded accounts and NO localStorage fallback: the backend is the
  // single source of truth for credentials, roles and account status.

  // Login/signup now live on the dedicated auth page (login.html) instead of
  // a modal dialog. Every trigger navigates there; ?mode=signup deep-links
  // straight to the signup tab.
  document.addEventListener("click", (event) => {
    const loginTrigger = event.target.closest(".js-login-trigger");
    if (!loginTrigger) return;

    event.preventDefault();
    window.location.href = "login.html";
  });

  // --- Dynamic Toast System ---
  window.showToast = (message, type = "success") => {
    // Remove existing toast if visible
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();

    // Create toast
    const toast = document.createElement("div");
    toast.className = `toast toast-${type} show`;

    // Icon selection
    let icon = "✓";
    if (type === "danger") icon = "✕";
    if (type === "warning") icon = "⚠";

    toast.innerHTML = `
      <span style="font-weight: bold; font-size: 1.2rem;">${icon}</span>
      <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Fade out after 3 seconds
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  };

  const ensureModalStyles = () => {
    if (document.getElementById("custom-modal-styles")) return;
    const style = document.createElement("style");
    style.id = "custom-modal-styles";
    style.textContent = `
      .custom-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(9, 51, 39, 0.5);
        backdrop-filter: blur(4px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .custom-modal-overlay.custom-modal-overlay-inline {
        position: absolute;
        z-index: 10;
      }
      .custom-modal-overlay.show {
        opacity: 1;
      }
      .custom-modal-panel {
        background: var(--surface-solid, #ffffff);
        color: var(--color-text-main, #1f2937);
        border-radius: var(--radius-lg, 16px);
        width: min(440px, 100%);
        padding: 1.75rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        transform: scale(0.95);
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        direction: rtl;
        font-family: inherit;
      }
      .custom-modal-overlay.show .custom-modal-panel {
        transform: scale(1);
      }
      .custom-modal-body {
        margin-bottom: 1.5rem;
      }
      .custom-modal-message {
        font-size: 1.05rem;
        line-height: 1.6;
        margin: 0;
        font-weight: 500;
        color: var(--color-text-main, #1f2937);
      }
      .custom-modal-input {
        width: 100%;
        padding: 0.75rem 1rem;
        margin-top: 1rem;
        border: 1px solid var(--color-border, #d1d5db);
        border-radius: var(--radius-md, 8px);
        background: var(--input-bg, #ffffff);
        color: var(--color-text-main, #1f2937);
        font-size: 1rem;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .custom-modal-input:focus {
        border-color: var(--color-primary, #0f766e);
        box-shadow: 0 0 0 3px var(--color-primary-ghost, rgba(15, 118, 110, 0.15));
      }
      .custom-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
      }
      .custom-modal-btn {
        padding: 0.6rem 1.2rem;
        font-size: 0.95rem;
        font-weight: 600;
        border-radius: var(--radius-md, 8px);
        border: none;
        cursor: pointer;
        transition: background-color 0.15s, transform 0.1s;
      }
      .custom-modal-btn:active {
        transform: scale(0.97);
      }
      .custom-modal-btn-confirm {
        background-color: var(--color-primary, #0f766e);
        color: #ffffff;
      }
      .custom-modal-btn-confirm:hover {
        background-color: var(--color-primary-dark, #0d5c56);
      }
      .custom-modal-btn-confirm.btn-danger {
        background-color: var(--color-danger, #ef4444);
        color: #ffffff;
      }
      .custom-modal-btn-confirm.btn-danger:hover {
        background-color: #dc2626;
      }
      .custom-modal-btn-cancel {
        background-color: var(--color-primary-ghost, #f3f4f6);
        color: var(--color-primary-ink, #4b5563);
      }
      .custom-modal-btn-cancel:hover {
        background-color: #e5e7eb;
      }
      /* Dark mode: the panel already uses --surface-solid (dark navy) so the
         adapting text token keeps it readable. The cancel/confirm buttons get
         explicit dark-theme colors so they stay legible on the dark panel. */
      [data-theme="dark"] .custom-modal-panel,
      [data-theme="dark"] .custom-modal-message {
        color: var(--color-text-main);
      }
      [data-theme="dark"] .custom-modal-input {
        color: var(--color-text-main);
      }
      [data-theme="dark"] .custom-modal-btn-confirm {
        color: #ffffff;
      }
      [data-theme="dark"] .custom-modal-btn-confirm.btn-danger {
        background-color: #7f1d1d;
        color: #ffffff;
      }
      [data-theme="dark"] .custom-modal-btn-confirm.btn-danger:hover {
        background-color: #991b1b;
      }
      [data-theme="dark"] .custom-modal-btn-cancel {
        background-color: var(--surface-solid);
        color: var(--color-text-main);
      }
      [data-theme="dark"] .custom-modal-btn-cancel:hover {
        background-color: var(--row-hover);
      }
    `;
    document.head.appendChild(style);
  };

  window.showConfirmModal = (message, options = {}) => {
    ensureModalStyles();
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "custom-modal-overlay";

      const isDestructive =
        options.isDestructive || /حذف|الغاء|خروج/i.test(message);
      const confirmClass = isDestructive
        ? "custom-modal-btn custom-modal-btn-confirm btn-danger"
        : "custom-modal-btn custom-modal-btn-confirm";
      const confirmText = options.confirmText || "تأكيد";
      const cancelText = options.cancelText || "إلغاء";

      overlay.innerHTML = `
        <div class="custom-modal-panel">
          <div class="custom-modal-body">
            <p class="custom-modal-message">${message}</p>
          </div>
          <div class="custom-modal-actions">
            <button class="custom-modal-btn custom-modal-btn-cancel">${cancelText}</button>
            <button class="${confirmClass}">${confirmText}</button>
          </div>
        </div>
      `;

      const mount = options.container || document.body;
      if (options.container) {
        overlay.classList.add("custom-modal-overlay-inline");
        if (getComputedStyle(mount).position === "static") {
          mount.style.position = "relative";
        }
      }
      mount.appendChild(overlay);

      // Trigger transition
      requestAnimationFrame(() => overlay.classList.add("show"));

      const confirmBtn = overlay.querySelector(".custom-modal-btn-confirm");
      const cancelBtn = overlay.querySelector(".custom-modal-btn-cancel");

      const cleanup = (result) => {
        overlay.classList.remove("show");
        setTimeout(() => {
          overlay.remove();
          resolve(result);
        }, 200);
      };

      confirmBtn.addEventListener("click", () => cleanup(true));
      cancelBtn.addEventListener("click", () => cleanup(false));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) cleanup(false);
      });
    });
  };

  window.showPromptModal = (message, defaultValue = "", options = {}) => {
    ensureModalStyles();
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "custom-modal-overlay";

      const confirmText = options.confirmText || "تأكيد";
      const cancelText = options.cancelText || "إلغاء";
      const placeholder = options.placeholder || "";

      overlay.innerHTML = `
        <div class="custom-modal-panel">
          <div class="custom-modal-body">
            <p class="custom-modal-message">${message}</p>
            <input type="text" class="custom-modal-input" value="${defaultValue}" placeholder="${placeholder}" />
          </div>
          <div class="custom-modal-actions">
            <button class="custom-modal-btn custom-modal-btn-cancel">${cancelText}</button>
            <button class="custom-modal-btn custom-modal-btn-confirm">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = overlay.querySelector(".custom-modal-input");
      setTimeout(() => input.focus(), 50);

      // Trigger transition
      requestAnimationFrame(() => overlay.classList.add("show"));

      const confirmBtn = overlay.querySelector(".custom-modal-btn-confirm");
      const cancelBtn = overlay.querySelector(".custom-modal-btn-cancel");

      const cleanup = (result) => {
        overlay.classList.remove("show");
        setTimeout(() => {
          overlay.remove();
          resolve(result);
        }, 200);
      };

      confirmBtn.addEventListener("click", () => cleanup(input.value.trim()));
      cancelBtn.addEventListener("click", () => cleanup(null));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          cleanup(input.value.trim());
        } else if (e.key === "Escape") {
          e.preventDefault();
          cleanup(null);
        }
      });
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) cleanup(null);
      });
    });
  };

  // --- Backend API helpers -------------------------------------------------
  // --- Backend API configuration -------------------------------------------
  // AUTH API: real backend (source of truth). Set in .env / Vercel:
  //   VITE_API_URL=https://ms-asmaa.vercel.app/api/v1
  // Auth calls are therefore ${API_BASE}/auth/login and ${API_BASE}/auth/signup.
  const API_BASE = import.meta.env.VITE_API_URL;

  /**
   * JWT helpers. The token comes from POST ${API_BASE}/auth/login and is sent
   * back on every protected request as: Authorization: Bearer <token>.
   * localStorage keeps ONLY the token + non-sensitive UI state (role/name/id);
   * passwords are never stored anywhere.
   */
  const getAuthToken = () => {
    try {
      return localStorage.getItem("token") || "";
    } catch (_) {
      return "";
    }
  };

  /** Headers for protected requests (fresh read on every call). */
  const authHeaders = () => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  /**
   * fetch() + safe JSON parsing with human-readable Arabic errors.
   * Prevents cryptic "Unexpected token '<' in JSON" crashes when the
   * backend is down or the request lands on a static page instead.
   * The error now names the exact URL + status so misrouted requests
   * (Live Server / GitHub Pages hitting a non-API origin) are obvious.
   */
  // ------------------------------------------------------------------
  // Floating upload status card. Uploads must never lock the page: the
  // teacher can keep scrolling/navigating WITHIN the page while the file
  // uploads, and the card keeps showing live progress anywhere on screen.
  // ------------------------------------------------------------------
  const UploadFloat = (() => {
    let el = null;
    let bar = null;
    let label = null;
    let active = false;
    // When true, a service-worker job owns the card (it broadcasts progress
    // from outside this page), so page-local calls must not fight it.
    let swOwned = false;

    const ensure = () => {
      if (el) return;
      el = document.createElement("div");
      el.className = "upload-floating-status";
      el.innerHTML =
        '<strong class="ufl-title"></strong>' +
        '<div class="upload-progress-bar"><div></div></div>' +
        '<small class="ufl-label"></small>';
      document.body.appendChild(el);
      bar = el.querySelector(".upload-progress-bar > div");
      label = el.querySelector(".ufl-label");
    };

    return {
      markSwOwned(value) {
        swOwned = !!value;
      },
      show(titleText, pct = 0, message = null, force = false) {
        if (swOwned && !force) return;
        ensure();
        el.style.display = "block";
        active = true;
        bar.style.width = `${pct}%`;
        el.querySelector(".ufl-title").textContent = titleText;
        label.textContent = message || `${pct}%`;
      },
      update(pct, message, force = false) {
        if (!el || (swOwned && !force)) return;
        bar.style.width = pct + "%";
        label.textContent = message || pct + "%";
      },
      done(message) {
        swOwned = false;
        if (!el) return;
        bar.style.width = "100%";
        label.textContent = message;
        setTimeout(() => {
          if (el) el.style.display = "none";
          active = false;
        }, 4000);
      },
      fail(message) {
        swOwned = false;
        if (!el) return;
        label.textContent = message;
        setTimeout(() => {
          if (el) el.style.display = "none";
          active = false;
        }, 6000);
      },
      get isActive() {
        return active;
      },
    };
  })();

  // ------------------------------------------------------------------
  // Service-Worker background uploads. When a worker controls the page,
  // uploads are handed to it (job stored in IndexedDB) so they KEEP RUNNING
  // while the teacher navigates to other pages of the app. Progress arrives
  // over a BroadcastChannel and drives the floating card from any page.
  // Browsers without SW fall back to the classic inline upload.
  // ------------------------------------------------------------------
  const UPLOAD_CHANNEL_NAME = "msasmaa-uploads";
  const UPLOAD_WORKFLOW_STORAGE_KEY = "teacherUploadWorkflows";
  const getUploadWorkflowStorageKey = () => {
    const teacherId = String(localStorage.getItem("userId") || "").trim();
    return teacherId ? `${UPLOAD_WORKFLOW_STORAGE_KEY}:${teacherId}` : null;
  };
  const readUploadWorkflows = () => {
    const key = getUploadWorkflowStorageKey();
    if (!key) return [];
    try {
      const workflows = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(workflows) ? workflows : [];
    } catch (_) {
      return [];
    }
  };
  const writeUploadWorkflows = (workflows) => {
    const key = getUploadWorkflowStorageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(workflows));
    } catch (_) {
      /* best-effort */
    }
  };
  const saveUploadWorkflow = (workflow) => {
    const workflows = readUploadWorkflows().filter(
      (item) => item.jobId !== workflow.jobId,
    );
    workflows.push(workflow);
    writeUploadWorkflows(workflows);
  };
  const removeUploadWorkflow = (jobId) => {
    writeUploadWorkflows(
      readUploadWorkflows().filter((item) => item.jobId !== jobId),
    );
  };

  const updateUploadWorkflowUi = (job, pct, message) => {
    const kind = job.kind || job.meta?.kind;
    const isPdf = kind === "pdf";
    const progressArea = document.querySelector(
      isPdf ? "#upload-pdf-progress-area" : "#upload-progress-area",
    );
    const progressBar = document.querySelector(
      isPdf ? "#upload-pdf-progress-bar" : "#upload-progress-bar",
    );
    const statusText = document.querySelector(
      isPdf ? "#upload-pdf-status-text" : "#upload-status-text",
    );
    const uploadButton = document.querySelector(
      isPdf ? "#btn-upload-material" : "#btn-upload-video",
    );
    if (progressArea) progressArea.style.display = "block";
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (statusText) statusText.textContent = message;
    if (uploadButton) {
      uploadButton.disabled = !["done", "failed"].includes(job.status);
    }
  };

  let restoreTeacherUploadWorkflow = null;
  const swUploadAvailable =
    "serviceWorker" in navigator && typeof BroadcastChannel !== "undefined";

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline/dev */
    });
  }

  function openUploadDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("msasmaa-uploads", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("jobs", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function idbPutJob(job) {
    const db = await openUploadDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("jobs", "readwrite");
      tx.objectStore("jobs").put(job);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Resolves when the worker reports done/failed for this job. */
  function waitForUploadOutcome(jobId) {
    return new Promise((resolve) => {
      const channel = new BroadcastChannel(UPLOAD_CHANNEL_NAME);
      const handler = (event) => {
        const m = event.data || {};
        if (m.jobId !== jobId) return;
        if (m.type === "done") {
          cleanup();
          resolve({ ok: true, kind: m.kind });
        } else if (m.type === "failed") {
          cleanup();
          resolve({ ok: false, error: m.error });
        }
      };
      const cleanup = () => {
        channel.removeEventListener("message", handler);
        channel.close();
      };
      channel.addEventListener("message", handler);
    });
  }

  /** Registers global progress listeners once, driving the floating card. */
  let uploadGlueInstalled = false;
  function installUploadUiGlue() {
    if (uploadGlueInstalled || !swUploadAvailable) return;
    uploadGlueInstalled = true;

    const channel = new BroadcastChannel(UPLOAD_CHANNEL_NAME);
    channel.onmessage = (event) => {
      const m = event.data || {};
      if (m.type === "started") {
        UploadFloat.markSwOwned(true);
        UploadFloat.show(m.label || "جاري رفع ملف", 0, "جاري الرفع...", true);
      } else if (m.type === "progress") {
        UploadFloat.update(
          m.pct,
          m.stage === "finalizing"
            ? "جاري تحسين الملف على السيرفر..."
            : `جاري الرفع... ${m.pct}%`,
          true,
        );
      } else if (m.type === "done") {
        UploadFloat.done("تم الرفع بنجاح ✔");
      } else if (m.type === "failed") {
        UploadFloat.fail(`فشل الرفع: ${m.error || ""}`);
      }
    };

    // Restore the card after navigation if jobs are still running.
    navigator.serviceWorker.ready.then((registration) => {
      if (registration.active) {
        registration.active.postMessage({ type: "GET_ACTIVE_JOBS" });
      }
    });

    const stateChannel = new BroadcastChannel(UPLOAD_CHANNEL_NAME);
    stateChannel.onmessage = (event) => {
      const m = event.data || {};
      if (m.type === "UPLOAD_WORKFLOWS" && m.jobs && m.jobs.length) {
        m.jobs.forEach((job) => {
          const pct = Number(job.progress) || 0;
          const message =
            job.status === "finalizing"
              ? "جاري تحسين الملف على السيرفر..."
              : `جاري الرفع... ${pct}%`;
          if (job.status === "done") {
            updateUploadWorkflowUi(job, 100, "تم رفع الملف بنجاح ✔");
            UploadFloat.markSwOwned(true);
            UploadFloat.show(
              job.label || "تم رفع الملف",
              100,
              "تم الرفع بنجاح ✔",
              true,
            );
          } else if (job.status === "failed") {
            updateUploadWorkflowUi(job, pct, `فشل الرفع: ${job.error || ""}`);
            UploadFloat.markSwOwned(true);
            UploadFloat.show(
              job.label || "فشل الرفع",
              pct,
              `فشل الرفع: ${job.error || ""}`,
              true,
            );
          } else {
            updateUploadWorkflowUi(job, pct, message);
            UploadFloat.markSwOwned(true);
            UploadFloat.show(job.label || "جاري رفع ملف", pct, message, true);
          }
          restoreTeacherUploadWorkflow?.(job);
        });
      }
    };
  }
  installUploadUiGlue();

  /** Hands an upload job to the service worker; resolves on its outcome. */
  async function startSwUploadJob(job) {
    await idbPutJob(job);
    try {
      const registration = await navigator.serviceWorker.ready;
      (registration.active || navigator.serviceWorker.controller).postMessage({
        type: "START_UPLOAD",
        jobId: job.id,
      });
    } catch (error) {
      // Worker unreachable — remove the queued job and signal failure so
      // the caller can fall back to the inline path cleanly.
      try {
        const db = await openUploadDb();
        const tx = db.transaction("jobs", "readwrite");
        tx.objectStore("jobs").delete(job.id);
      } catch (_) {
        /* ignore */
      }
      return { ok: false, error: error.message };
    }
    return waitForUploadOutcome(job.id);
  }

  // Warn before closing/leaving mid-upload ONLY in fallback mode — with the
  // service worker active, uploads survive navigating to other pages, so
  // warning on every click would just be annoying.
  window.addEventListener("beforeunload", (event) => {
    if (!swUploadAvailable && UploadFloat.isActive) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  // Persist upload form fields so typed info (video name, links...) survives
  // navigating between pages and back within the same tab.
  const UPLOAD_PERSIST_FIELDS = ["upload-title"];
  const restoreUploadFormFields = () => {
    UPLOAD_PERSIST_FIELDS.forEach((fieldId) => {
      const field = document.querySelector(`#${fieldId}`);
      if (!field) return;
      try {
        const savedValue = sessionStorage.getItem(`uploadForm:${fieldId}`);
        if (savedValue !== null && !field.value) field.value = savedValue;
        field.addEventListener("input", () => {
          sessionStorage.setItem(`uploadForm:${fieldId}`, field.value);
        });
      } catch (_) {
        /* best-effort */
      }
    });
  };
  restoreUploadFormFields();

  const fetchJson = async (url, options = {}) => {
    let response;
    try {
      response = await fetch(url, options);
    } catch (networkError) {
      throw new Error(
        `لا يمكن الوصول إلى السيرفر (${url}). تأكد من تشغيل السيرفر (node server.js) ثم أعد المحاولة.`,
      );
    }

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (parseError) {
      // Non-JSON response: usually HTML from a static host or an error page.
      const preview = raw
        .replace(/<[^>]*>/g, " ")
        .trim()
        .slice(0, 80);
      throw new Error(
        `السيرفر في ${url} أعاد رداً غير JSON (كود ${response.status})${preview ? `: ${preview}` : ""}. إن كنت تستخدم Live Server أو GitHub Pages فشغّل node server.js محلياً أو انشر على Vercel مع متغيرات BUNNY.`,
      );
    }

    if (!response.ok) {
      // The v1 backend sends { message } (errorMiddleware); older routes send
      // { error }. Show whichever the backend actually returned.
      throw new Error(
        data.message || data.error || `خطأ من السيرفر (${response.status}).`,
      );
    }
    return data;
  };

  const restoredVideoPolls = new Set();
  const acknowledgeUploadWorkflow = (jobId) => {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({
          type: "ACK_UPLOAD_WORKFLOW",
          jobId,
        });
      })
      .catch(() => {});
  };
  const removeWorkflowLater = (jobId, delay = 10000) => {
    window.setTimeout(() => {
      removeUploadWorkflow(jobId);
      acknowledgeUploadWorkflow(jobId);
    }, delay);
  };
  const restoreVideoProcessing = (workflow) => {
    if (!workflow.lessonId || restoredVideoPolls.has(workflow.jobId)) return;
    restoredVideoPolls.add(workflow.jobId);

    const progressArea = document.querySelector("#upload-progress-area");
    const progressBar = document.querySelector("#upload-progress-bar");
    const statusText = document.querySelector("#upload-status-text");
    const update = (pct, message) => {
      if (progressArea) progressArea.style.display = "block";
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (statusText) statusText.textContent = message;
      UploadFloat.markSwOwned(true);
      UploadFloat.show(workflow.label || "فيديو", pct, message, true);
      UploadFloat.update(pct, message, true);
    };

    let failures = 0;
    const poll = async () => {
      try {
        const status = await fetchJson(
          `/api/lessons/${encodeURIComponent(workflow.lessonId)}/video-status`,
          { headers: authHeaders() },
        );
        failures = 0;
        const pct = Math.max(Number(status.encodeProgress) || 0, 5);
        if (status.ready) {
          update(100, "الفيديو جاهز ✅ — تم الرفع بنجاح");
          UploadFloat.done("الفيديو جاهز ✅");
          removeWorkflowLater(workflow.jobId);
          return;
        }
        if ([5, 6].includes(status.status)) {
          update(pct, "فشلت معالجة الفيديو على Bunny.");
          UploadFloat.fail("فشلت معالجة الفيديو.");
          removeWorkflowLater(workflow.jobId);
          return;
        }
        update(pct, "جاري معالجة الفيديو على Bunny...");
      } catch (_) {
        failures += 1;
        update(
          Number(workflow.progress) || 100,
          `تعذر التحقق مؤقتاً — سنعيد المحاولة (${failures}/6)...`,
        );
        if (failures >= 6) {
          UploadFloat.fail("انقطعت مراقبة المعالجة.");
          return;
        }
      }
      window.setTimeout(poll, 5000);
    };
    poll();
  };

  restoreTeacherUploadWorkflow = (job) => {
    const stored = readUploadWorkflows().find((item) => item.jobId === job.id);
    const workflow = { ...(stored || {}), ...(job.meta || {}), jobId: job.id };
    if (
      job.kind === "video" &&
      (job.status === "done" || workflow.phase === "processing")
    ) {
      restoreVideoProcessing(workflow);
    }
    if (job.kind === "pdf" && job.status === "done") {
      updateUploadWorkflowUi(job, 100, "تم رفع ملف PDF للدرس بنجاح ✔");
      removeWorkflowLater(job.id);
    }
    if (job.status === "failed") {
      removeWorkflowLater(job.id, 60000);
    }
  };
  readUploadWorkflows().forEach((workflow) => {
    if (workflow.kind === "video" && workflow.phase === "processing") {
      restoreVideoProcessing(workflow);
    }
  });

  // --- Teacher registration requests --------------------------------------
  // This page uses the existing fetchJson/authHeaders/toast helpers. Its
  // count is always derived from the single GET response; no count endpoint
  // is requested.
  const requestsPage = document.querySelector("#registration-requests-page");
  if (requestsPage) {
    const list = document.querySelector("#registration-requests-list");
    const count = document.querySelector("#pending-requests-count");
    let requests = [];
    let activeRequestId = "";

    const renderRequests = () => {
      count.textContent = String(requests.length);
      list.replaceChildren();

      if (!requests.length) {
        const empty = document.createElement("p");
        empty.className = "text-muted registration-requests-empty";
        empty.textContent = "No pending registration requests.";
        list.appendChild(empty);
        return;
      }

      const table = document.createElement("table");
      table.className = "table registration-requests-table";
      table.innerHTML =
        "<thead><tr><th>Student Name</th><th>Student Code</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>";
      const body = document.createElement("tbody");

      requests.forEach((request) => {
        const row = document.createElement("tr");
        const date = request.createdAt ? new Date(request.createdAt) : null;
        const displayDate =
          date && !Number.isNaN(date.getTime())
            ? new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(date)
            : "—";

        const cells = [
          request.name || "—",
          request.studentCode || "—",
          displayDate,
        ];
        cells.forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        });

        const statusCell = document.createElement("td");
        const status = document.createElement("span");
        status.className = "badge badge-warning";
        status.textContent = request.status || "PENDING";
        statusCell.appendChild(status);
        row.appendChild(statusCell);

        const actionsCell = document.createElement("td");
        actionsCell.className = "registration-request-actions";
        const approve = document.createElement("button");
        approve.className = "btn btn-primary";
        approve.type = "button";
        approve.textContent =
          activeRequestId === request.id ? "Approving..." : "Approve";
        approve.disabled = Boolean(activeRequestId);
        approve.addEventListener("click", () =>
          processRequest(request.id, "approve"),
        );

        const reject = document.createElement("button");
        reject.className = "btn btn-danger";
        reject.type = "button";
        reject.textContent =
          activeRequestId === request.id ? "Rejecting..." : "Reject";
        reject.disabled = Boolean(activeRequestId);
        reject.addEventListener("click", () =>
          processRequest(request.id, "reject"),
        );
        actionsCell.append(approve, reject);
        row.appendChild(actionsCell);
        body.appendChild(row);
      });

      table.appendChild(body);
      const wrapper = document.createElement("div");
      wrapper.className = "table-responsive";
      wrapper.appendChild(table);
      list.appendChild(wrapper);
    };

    const loadRequests = async () => {
      list.innerHTML = skeletonRows(3);
      try {
        const data = await fetchJson(`${API_BASE}/registration-requests`, {
          headers: authHeaders(),
        });
        requests = Array.isArray(data?.data?.requests)
          ? data.data.requests
          : [];
        renderRequests();
      } catch (error) {
        requests = [];
        count.textContent = "0";
        list.innerHTML = skeletonError(
          "Unable to load registration requests.",
          "Retry",
        );
        list
          .querySelector(".skeleton-retry-btn")
          ?.addEventListener("click", loadRequests);
        showToast(error.message, "danger");
      }
    };

    const processRequest = async (id, action) => {
      if (activeRequestId) return;
      activeRequestId = id;
      renderRequests();
      try {
        const data = await fetchJson(
          `${API_BASE}/registration-requests/${encodeURIComponent(id)}/${action}`,
          {
            method: "PATCH",
            headers: authHeaders(),
          },
        );
        showToast(
          data.message || `Registration request ${action}d successfully.`,
          "success",
        );
        activeRequestId = "";
        await loadRequests();
      } catch (error) {
        activeRequestId = "";
        renderRequests();
        showToast(error.message, "danger");
      }
    };

    loadRequests();
  }

  const studentsSection = document.querySelector("#teacher-students-section");
  if (studentsSection) {
    initStudentsPage({ API_BASE, authHeaders, fetchJson, showToast });
  }

  if (document.querySelector('#student-mistakes-page')) {
    initStudentMistakesPage({ API_BASE, authHeaders, fetchJson, showToast });
  }

  const teacherDashboard = document.querySelector("#teacher-dashboard-page");
  if (teacherDashboard) {
    document
      .querySelector("#btn-teacher-add")
      ?.addEventListener("click", () => {
        window.location.href = "students.html";
      });

    const totalStudents = document.querySelector("#teacher-total-students");
    const activeQuizzes = document.querySelector("#teacher-active-quizzes");
    Promise.all([
      fetchJson(`${API_BASE}/students/count`, { headers: authHeaders() }),
      fetchJson("/api/quizzes-managed", { headers: authHeaders() }),
    ])
      .then(([studentData, quizData]) => {
        if (totalStudents) {
          totalStudents.textContent = String(studentData?.data?.count ?? 0);
        }
        if (activeQuizzes) {
          const now = Date.now();
          const count = (quizData?.quizzes || []).filter((quiz) => {
            return (
              Date.parse(quiz.startTime) <= now &&
              Date.parse(quiz.endTime) > now
            );
          }).length;
          activeQuizzes.textContent = String(count);
        }
      })
      .catch((error) => {
        console.warn("[teacher-dashboard] Failed to refresh summary:", error);
      });
  }

  // --- Tab Switcher Logic (e.g., Lesson Page) ---
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  if (tabBtns.length > 0) {
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-tab");

        // Remove active from all buttons & panels
        tabBtns.forEach((b) => b.classList.remove("active"));
        tabPanels.forEach((p) => p.classList.remove("active"));

        // Set active on click
        btn.classList.add("active");
        const panel = document.getElementById(targetTab);
        if (panel) panel.classList.add("active");
      });
    });
  }

  // --- Lesson Category Filter (Lessons Listing Page) ---
  const filterBtns = document.querySelectorAll(".filter-btn");
  const lessonCards = document.querySelectorAll(".lesson-card-item");

  if (filterBtns.length > 0 && lessonCards.length > 0) {
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filterVal = btn.getAttribute("data-filter");

        // Toggle active button class
        filterBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        // Filter cards
        lessonCards.forEach((card) => {
          const cardCat = card.getAttribute("data-category");
          if (filterVal === "all" || cardCat === filterVal) {
            card.style.display = "block";
            card.style.opacity = "0";
            setTimeout(() => {
              card.style.transition = "opacity 0.3s ease";
              card.style.opacity = "1";
            }, 50);
          } else {
            card.style.display = "none";
          }
        });
      });
    });
  }

  // --- Contact Form Submission ---
  const contactForm = document.querySelector("#contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.querySelector("#contact-name").value.trim();
      const email = document.querySelector("#contact-email").value.trim();
      const msg = document.querySelector("#contact-message").value.trim();

      if (!name || !email || !msg) {
        showToast(
          "يرجى إدخال جميع الحقول لإرسال الرسالة الاستفسارية.",
          "danger",
        );
        return;
      }

      showToast(
        "تم إرسال رسالتك بنجاح! سيقوم الأستاذ أو طاقم الدعم بالتواصل معك قريباً.",
        "success",
      );
      contactForm.reset();
    });
  }

  // --- Teacher Dashboard Mock Buttons ---
  const btnExport = document.querySelector("#btn-teacher-export");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      showToast("جاري تصدير درجات الطلاب بصيغة Excel...", "success");
    });
  }
  // NOTE: The login/signup form used to be a modal injected here
  // (#login-modal-backdrop). It was replaced by the dedicated auth page:
  //   login.html + css/login.css + src/loginPage.js

  const NOTIFICATIONS_STORAGE_KEY = "frontEndNotifications";

  const getStoredItems = (key, fallbackItems = []) => {
    try {
      return JSON.parse(
        localStorage.getItem(key) || JSON.stringify(fallbackItems),
      );
    } catch (error) {
      return fallbackItems;
    }
  };

  const setStoredItems = (key, items) => {
    localStorage.setItem(key, JSON.stringify(items));
  };

  let cachedNotifications = [];
  let notificationsFetchedAt = 0;
  let notificationsInFlight = null;
  const NOTIFICATIONS_CACHE_TTL = 30_000; // 30 seconds

  const fetchNotifications = async () => {
    const userId = localStorage.getItem("userId");
    if (!userId) return [];
    const headers = authHeaders();
    const call = () =>
      fetchJson(`${API_BASE}/notifications`, { headers }).then(
        (data) => data.notifications || [],
      );
    // Fresh cache → return it and quietly refresh in the background so the
    // bell is never stale. (No re-render here — re-rendering while the menu
    // is open replays the fade-in and looks like blinking; the next open
    // shows the freshly fetched data instead.)
    if (
      cachedNotifications.length &&
      Date.now() - notificationsFetchedAt < NOTIFICATIONS_CACHE_TTL
    ) {
      call()
        .then((fresh) => {
          cachedNotifications = fresh;
          notificationsFetchedAt = Date.now();
        })
        .catch(() => {
          /* keep showing cached list */
        });
      return cachedNotifications;
    }
    // Memoize the in-flight request so the page-load prefetch and a quick
    // bell click (before it resolves) share ONE network call.
    if (!notificationsInFlight) {
      notificationsInFlight = call()
        .then((notifications) => {
          cachedNotifications = notifications;
          notificationsFetchedAt = Date.now();
          return notifications;
        })
        .finally(() => {
          notificationsInFlight = null;
        });
    }
    return notificationsInFlight;
  };

  const addNotification = (title, message, type = "news") => {
    console.warn(
      "[notifications] Local addNotification is deprecated. Trigger notifications via backend instead.",
    );
  };

  const updateNotificationBadge = async () => {
    let unreadCount = 0;
    try {
      const data = await fetchJson(`${API_BASE}/notifications/unread-count`, {
        headers: authHeaders(),
      });
      unreadCount = Number(data.count) || 0;
    } catch (error) {
      const notifications = await fetchNotifications();
      unreadCount = notifications.filter(
        (item) => !(item.isRead ?? item.read),
      ).length;
    }
    document.querySelectorAll(".notification-count").forEach((badge) => {
      badge.textContent = unreadCount;
      badge.hidden = unreadCount === 0;
    });
  };

  const renderNotificationsMenu = async (mode = "data") => {
    const list = document.querySelector("#notification-list");
    if (!list) return;

    // The container is ALREADY open (opened instantly on click); this only
    // repaints the INSIDE of it. Skeleton/error/data are three separate
    // internal states, never coupled to the open/close state of the menu.
    if (mode === "loading") {
      list.innerHTML = skeletonRows(4);
      return;
    }
    if (mode === "error") {
      list.innerHTML = '<div id="notifications-error-placeholder"></div>';
      const box = list.querySelector("#notifications-error-placeholder");
      box.innerHTML = skeletonError(
        "تعذر تحميل الإشعارات، حاولي مرة أخرى.",
        "إعادة المحاولة",
      );
      box.querySelector(".skeleton-retry-btn").addEventListener("click", () => {
        loadNotificationsIntoMenu(true);
      });
      return;
    }

    let notifications;
    try {
      notifications = await fetchNotifications();
    } catch (error) {
      console.warn("[notifications] Failed to fetch notifications:", error);
      renderNotificationsMenu("error");
      return;
    }

    if (!notifications.length) {
      list.innerHTML =
        '<div class="notification-empty">لا توجد إشعارات جديدة الآن.</div>';
      return;
    }

    list.innerHTML =
      '<div class="skeleton-reveal">' +
      notifications
        .slice(0, 6)
        .map(
          (item) => `
      <div class="notification-item ${(item.isRead ?? item.read) ? "" : "unread"}" data-id="${item.id}" data-link="${escapeHTML(item.link || "")}">
        <div class="notification-item-icon">${item.type === "quiz" ? "؟" : "!"}</div>
        <div>
          <h4>${escapeHTML(item.title)}</h4>
          <p>${escapeHTML(item.message)}</p>
        </div>
      </div>
    `,
        )
        .join("") +
      "</div>";

    // Bind click events on notification items to mark read on the backend and navigate
    list.querySelectorAll(".notification-item").forEach((item) => {
      item.addEventListener("click", async () => {
        const id = item.dataset.id;
        const link = item.dataset.link;
        try {
          await fetchJson(`${API_BASE}/notifications/${id}/read`, {
            method: "PATCH",
            headers: authHeaders(),
          });
          await updateNotificationBadge();
          if (link) {
            window.location.href = link;
          }
        } catch (error) {
          console.error("[notifications] Failed to mark read:", error);
          if (link) {
            window.location.href = link;
          }
        }
      });
    });
  };

  /** Opens the (already-mounted) menu instantly, then fills it with data.
   *  Fires a background prefetch on page load so the list is usually ready
   *  by the time the user actually clicks the bell.
   *  Renders exactly once (which is what prevents the "blinking": we never
   *  repaint the same data twice back-to-back). */
  const loadNotificationsIntoMenu = async (force = false) => {
    const menu = document.querySelector("#notification-menu");
    if (!menu) return;
    // Data already cached (e.g. from the page-load prefetch) → render it
    // straight away, no skeleton, no double paint.
    if (!force && cachedNotifications.length) {
      await renderNotificationsMenu("data");
      return;
    }
    // No data yet → show the skeleton once, then the real content once.
    renderNotificationsMenu("loading");
    try {
      await fetchNotifications();
      await renderNotificationsMenu("data");
    } catch (error) {
      renderNotificationsMenu("error");
    }
  };

  const escapeHTML = (value = "") =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const fileToDataURL = (file) =>
    new Promise((resolve, reject) => {
      if (!file) {
        resolve("");
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", reject);
      reader.readAsDataURL(file);
    });

  const initializeQuizExperience = () => {
    fetchNotifications().catch(() => {});
    updateNotificationBadge();
  };

  const getNotificationButtonHTML = () => {
    if (localStorage.getItem("userRole") !== "student") return "";
    return `
    <div class="notification-center">
      <button class="notification-btn" id="notification-btn" type="button" title="الإشعارات" aria-label="الإشعارات">
        <span class="notification-symbol">!</span>
        <span class="notification-count" hidden>0</span>
      </button>
      <div class="notification-menu" id="notification-menu">
        <div class="notification-menu-header">
          <strong>الإشعارات</strong>
          <button type="button" id="mark-notifications-read">تمت القراءة</button>
        </div>
        <div id="notification-list"></div>
      </div>
    </div>
  `;
  };

  // Populate auth placeholders dynamically
  const updateAuthUI = () => {
    // Reinitialize the entire navbar (switches between minimal and full navbar)
    reinitializeNavbarUI();

    const userRole = localStorage.getItem("userRole");
    const username = localStorage.getItem("username") || "";

    // Update any username greeting placeholders on dashboard
    const namePlaceholders = document.querySelectorAll(
      ".student-name-placeholder",
    );
    namePlaceholders.forEach((el) => {
      el.textContent = username || "طالب زائر";
    });

    const navAuthContainer = document.querySelector(".nav-auth-container");
    const mobileAuthContainer = document.querySelector(
      ".mobile-auth-container",
    );

    if (userRole) {
      // User is logged in
      const logoutTitle = `تسجيل الخروج من الحساب (${username})`;

      if (navAuthContainer) {
        navAuthContainer.innerHTML = `
          ${getNotificationButtonHTML()}
          <button class="login-icon-btn logged-in" id="auth-action-btn" title="${logoutTitle}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        `;
      }

      if (mobileAuthContainer) {
        const notificationAction =
          userRole === "student"
            ? '<button class="btn btn-light btn-full" id="mobile-notifications-btn">الإشعارات الجديدة</button>'
            : "";
        mobileAuthContainer.innerHTML = `
          ${notificationAction}
          <button class="btn btn-danger btn-full" id="mobile-logout-btn">تسجيل الخروج (${username})</button>
        `;
      }
    } else {
      // User is logged out
      if (navAuthContainer) {
        navAuthContainer.innerHTML = `
          ${getNotificationButtonHTML()}
          <button class="login-icon-btn" id="auth-action-btn" title="تسجيل الدخول">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </button>
        `;
      }

      if (mobileAuthContainer) {
        mobileAuthContainer.innerHTML = `
          <button class="btn btn-primary btn-full" id="mobile-login-btn">تسجيل الدخول</button>
        `;
      }
    }

    // Bind Auth Button Clicks
    const authBtn = document.querySelector("#auth-action-btn");
    if (authBtn) {
      authBtn.addEventListener("click", handleAuthAction);
    }

    const notificationBtn = document.querySelector("#notification-btn");
    const notificationMenu = document.querySelector("#notification-menu");
    if (notificationBtn && notificationMenu) {
      notificationBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        // OPEN INSTANTLY using pure local state — never wait for the fetch.
        // The closed->open transition uses only the .show class toggle, so
        // it happens on the very next frame regardless of network speed.
        const willOpen = !notificationMenu.classList.contains("show");
        notificationMenu.classList.toggle("show", willOpen);
        if (willOpen) {
          // Fill the inside with data (skeleton while loading). Repainting
          // the content must NOT gate the visibility transition above.
          loadNotificationsIntoMenu();
        }
      });
    }

    const markNotificationsRead = document.querySelector(
      "#mark-notifications-read",
    );
    if (markNotificationsRead) {
      markNotificationsRead.addEventListener("click", async () => {
        try {
          await fetchJson(`${API_BASE}/notifications/read-all`, {
            method: "PATCH",
            headers: authHeaders(),
          });
          await renderNotificationsMenu();
          await updateNotificationBadge();
        } catch (error) {
          console.error("[notifications] Failed to mark all read:", error);
        }
      });
    }

    const mobileNotificationsBtn = document.querySelector(
      "#mobile-notifications-btn",
    );
    if (mobileNotificationsBtn) {
      mobileNotificationsBtn.addEventListener("click", async () => {
        const notifications = await fetchNotifications();
        const latestNotification = notifications[0];
        showToast(
          latestNotification?.message || "لا توجد إشعارات جديدة الآن.",
          latestNotification?.type === "quiz" ? "success" : "warning",
        );
      });
    }

    const mobileLogoutBtn = document.querySelector("#mobile-logout-btn");
    if (mobileLogoutBtn) {
      mobileLogoutBtn.addEventListener("click", handleLogout);
    }

    const mobileLoginBtn = document.querySelector("#mobile-login-btn");
    if (mobileLoginBtn) {
      mobileLoginBtn.addEventListener("click", () => {
        window.location.href = "login.html";
      });
    }

    // Warm the notification cache in the background so the bell opens
    // instantly; the render itself happens on click (loadNotificationsIntoMenu)
    // so we never paint twice and never get a blink.
    fetchNotifications().catch(() => {});
    updateNotificationBadge();
  };

  document.addEventListener("click", (event) => {
    const notificationCenter = document.querySelector(".notification-center");
    const notificationMenu = document.querySelector("#notification-menu");
    if (
      notificationCenter &&
      notificationMenu &&
      !notificationCenter.contains(event.target)
    ) {
      notificationMenu.classList.remove("show");
    }
  });

  const handleAuthAction = () => {
    const userRole = localStorage.getItem("userRole");
    if (userRole) {
      handleLogout();
    } else {
      window.location.href = "login.html";
    }
  };

  const handleLogout = async () => {
    const confirmed = await showConfirmModal(
      "هل تريد بالتأكيد تسجيل الخروج من الحساب؟",
      { confirmText: "تسجيل الخروج", cancelText: "إلغاء" },
    );
    if (!confirmed) return;
    localStorage.removeItem("userRole");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");
    localStorage.removeItem("token");
    showToast("تم تسجيل الخروج بنجاح. نتمنى رؤيتك قريباً! 👋", "success");
    updateAuthUI();
    // Redirect to index page
    setTimeout(() => {
      window.location.href = "index.html";
    }, 800);
  };

  // NOTE: Login/signup submission now lives on the dedicated auth page
  // (src/loginPage.js) with identical endpoints, payloads and validation.

  // Initialize Auth UI
  updateAuthUI();
  initializeQuizExperience();

  // --- Accordion Expand/Collapse Logic ---
  const accordionHeaders = document.querySelectorAll(".accordion-header");
  accordionHeaders.forEach((header) => {
    header.addEventListener("click", () => {
      const item = header.parentElement;
      const body = item.querySelector(".accordion-body");

      const isActive = item.classList.contains("active");

      if (isActive) {
        item.classList.remove("active");
        body.style.maxHeight = null;
      } else {
        item.classList.add("active");
        body.style.maxHeight = body.scrollHeight + "px";
      }
    });
  });

  // Initialize active accordions heights
  const activeAccordions = document.querySelectorAll(
    ".accordion-item.active .accordion-body",
  );
  activeAccordions.forEach((body) => {
    body.style.maxHeight = body.scrollHeight + "px";
  });

  // --- Dynamic URL Parameter Parsing for lesson-view.html ---
  if (window.location.pathname.includes("lesson-view.html")) {
    const urlParams = new URLSearchParams(window.location.search);
    const titleParam = urlParams.get("title");
    if (titleParam) {
      const decodedTitle = decodeURIComponent(titleParam);

      // Update page title tag
      document.title = `عرض الدرس | ${decodedTitle} | منصة المرسال`;

      // Update breadcrumbs title
      const bcTitle = document.querySelector("#lesson-breadcrumb-title");
      if (bcTitle) {
        bcTitle.textContent = decodedTitle;
      }

      // Update page heading
      const heading = document.querySelector("#lesson-name-heading");
      if (heading) {
        heading.textContent = decodedTitle;
      }

      // Update video overlay player title
      const videoTitle = document.querySelector("#lesson-video-title");
      if (videoTitle) {
        videoTitle.textContent = `شرح درس: ${decodedTitle}`;
      }
    }

    // --- Lesson identity + shared page elements ---
    const lessonId =
      urlParams.get("lesson") || urlParams.get("id") || "lesson-1";
    const playBtn = document.querySelector(".video-play-btn");
    const playerBox = document.querySelector(".video-player-mock");
    const durationEl = document.querySelector("#lesson-video-duration");
    const materialsBox = document.querySelector("#lesson-materials-list");

    // --- "دروس هذا الباب": render every lesson of the current chapter in
    // the sidebar so students can jump between sibling lessons instantly.
    const renderSidebarLessons = () => {
      const sidebar = document.querySelector("#sidebar-lessons-list");
      if (!sidebar) return;

      const chapters = (window.CURRICULUM && window.CURRICULUM.biology) || [];
      let chapter = chapters.find((c) => c.id === urlParams.get("chapter"));

      // Fallback: if no chapter param (e.g. opened via a legacy title link),
      // derive it from the current lesson id.
      if (!chapter) {
        chapter = chapters.find((c) =>
          c.lessons.some((l) => l.id === lessonId),
        );
      }

      if (!chapter) {
        sidebar.innerHTML =
          '<p class="text-muted" style="font-size:0.9rem; margin:0;">لا توجد دروس معروضة.</p>';
        return;
      }

      sidebar.innerHTML = "";
      chapter.lessons.forEach((lesson) => {
        const item = document.createElement("a");
        item.className = "lesson-list-item";
        item.style.cssText = "margin-bottom:0.5rem;";
        item.href =
          `lesson-view.html?lesson=${encodeURIComponent(lesson.id)}` +
          `&chapter=${encodeURIComponent(chapter.id)}` +
          `&title=${encodeURIComponent(lesson.name)}`;
        item.innerHTML = `<div class="lesson-list-item-title"><span class="lesson-list-item-icon">▶️</span><span>${lesson.name}</span></div>`;

        if (lesson.id === lessonId) {
          item.classList.add("sidebar-current");
          item.setAttribute("aria-current", "page");
        }
        sidebar.appendChild(item);
      });
    };
    renderSidebarLessons();

    // Inline PDF viewer (markup lives in lesson-view.html).
    const viewerPanel = document.querySelector("#lesson-pdf-viewer");
    const viewerTitle = document.querySelector("#lesson-pdf-viewer-title");
    const viewerFrame = document.querySelector("#lesson-pdf-frame");
    const viewerClose = document.querySelector("#lesson-pdf-viewer-close");

    // Auth headers come from the shared JWT helper (authHeaders() above).

    // Lesson videos state (filled by applyVideosData below).
    let lessonVideos = [];
    let currentVideoIdx = 0;

    /** "75" seconds -> "1:15" for the player overlay. */
    const formatDuration = (totalSeconds) => {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      return `${minutes}:${String(seconds).padStart(2, "0")}`;
    };

    /** Swaps the mock overlay for the Bunny embed player iframe. */
    const loadIframe = (videoEntry) => {
      if (!playerBox) return;
      playerBox.innerHTML =
        `<iframe src="${videoEntry.playbackUrl}" ` +
        'style="width:100%; height:100%; border:0;" ' +
        'allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" ' +
        'allowfullscreen loading="lazy"></iframe>';
    };

    let targetSeekTime = null;

    /** Seeks the active player to a specific timestamp in seconds. */
    const seekToTime = (seconds) => {
      const iframe = playerBox.querySelector("iframe");
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          JSON.stringify({
            context: "player.js",
            method: "setCurrentTime",
            value: seconds,
          }),
          "*",
        );
        iframe.contentWindow.postMessage(
          JSON.stringify({
            context: "player.js",
            method: "play",
          }),
          "*",
        );
      } else {
        targetSeekTime = seconds;
        const videoEntry = lessonVideos[currentVideoIdx];
        if (videoEntry) {
          if (playBtn) playBtn.disabled = true;
          showToast("جاري تشغيل الفيديو من بداية الفصل...", "success");
          loadIframe(videoEntry);
        }
      }
    };

    /** Renders the chapters list for a video part. */
    const renderChapters = (videoEntry) => {
      const chaptersContainer = document.querySelector(
        "#lesson-video-chapters-container",
      );
      const chaptersList = document.querySelector(
        "#lesson-video-chapters-list",
      );
      if (!chaptersContainer || !chaptersList) return;

      const chapters = videoEntry.chapters || [];
      if (!chapters.length) {
        chaptersContainer.style.display = "none";
        return;
      }

      chaptersList.innerHTML = "";
      chaptersContainer.style.display = "block";

      chapters.forEach((ch) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "btn btn-secondary";
        chip.style.cssText =
          "font-size:0.85rem; padding:0.4rem 0.9rem; border-radius:50px;";
        chip.textContent = `${ch.title} — ${formatDuration(ch.startTimeSeconds)}`;
        chip.addEventListener("click", () => {
          seekToTime(ch.startTimeSeconds);
        });
        chaptersList.appendChild(chip);
      });
    };

    // Listen to messages from the Bunny Stream player for ready events
    window.addEventListener("message", (event) => {
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (
          data &&
          (data.event === "ready" ||
            data.method === "ready" ||
            data.api === "ready")
        ) {
          if (targetSeekTime !== null) {
            const timeToSeek = targetSeekTime;
            targetSeekTime = null;
            setTimeout(() => {
              seekToTime(timeToSeek);
            }, 300);
          }
        }
      } catch (e) {
        /* ignore */
      }
    });

    /** Part buttons under the player when a lesson has several videos. */
    const renderVideoChooser = () => {
      if (!playerBox || lessonVideos.length <= 1) return;

      let chooser = document.querySelector("#lesson-video-chooser");
      if (!chooser) {
        chooser = document.createElement("div");
        chooser.id = "lesson-video-chooser";
        chooser.style.cssText =
          "display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.75rem;";
        playerBox.insertAdjacentElement("afterend", chooser);
      }
      chooser.innerHTML = "";

      lessonVideos.forEach((video, idx) => {
        const partBtn = document.createElement("button");
        partBtn.type = "button";
        partBtn.className = "btn btn-secondary";
        partBtn.style.cssText =
          "font-size:0.85rem; padding:0.4rem 0.9rem;" +
          (idx === currentVideoIdx ? " font-weight:700;" : "");
        partBtn.textContent = video.name || `الجزء ${idx + 1}`;
        if (!video.ready) partBtn.textContent += " (قيد المعالجة)";
        partBtn.addEventListener("click", () => {
          currentVideoIdx = idx;
          renderVideoSubtitle();
          renderVideoChooser();
          renderChapters(video);
          // Once playback started, switching parts loads them instantly.
          if (playerBox.querySelector("iframe")) {
            if (video.ready) {
              showToast(`جاري تشغيل: ${partBtn.textContent}`, "success");
              loadIframe(video);
            } else {
              showToast("هذا الجزء ما زال قيد المعالجة على Bunny.", "warning");
            }
          }
        });
        chooser.appendChild(partBtn);
      });
    };

    // Video-title subtitle: shows ONLY the title of the video currently
    // selected/playing (lessonVideos[currentVideoIdx]) beneath the lesson
    // heading — never a list of every video's title. Hidden when the current
    // video has no name.
    const renderVideoSubtitle = () => {
      const subtitleEl = document.querySelector("#lesson-video-subtitle");
      if (!subtitleEl) return;
      const video = lessonVideos[currentVideoIdx];
      const name =
        video && typeof video.name === "string" ? video.name.trim() : "";
      if (name) {
        subtitleEl.innerHTML = `<span class="lesson-video-subtitle-line">فيديو: ${escapeHTML(
          name,
        )}</span>`;
        subtitleEl.hidden = false;
      } else {
        subtitleEl.hidden = true;
        subtitleEl.innerHTML = "";
      }
    };

    // Manages a single "loading / error" placeholder node that lives inside
    // the PDF viewer panel next to the iframe.
    const setViewerPlaceholder = (html) => {
      if (!viewerFrame) return;
      let box = viewerFrame.previousElementSibling;
      if (box && box.classList.contains("lesson-material-loading")) {
        box.remove();
      }
      if (!html) return;
      box = document.createElement("div");
      box.className = "lesson-material-loading";
      box.innerHTML = html;
      viewerFrame.insertAdjacentElement("beforebegin", box);
      return box;
    };

    /** Shows the inline PDF viewer panel with a short-lived signed URL. */
    const openMaterialInViewer = async (material, triggerButton) => {
      // OPEN THE PANEL INSTANTLY with the title; the frame shows a loading
      // skeleton until the signed URL arrives. Never block appearance on
      // the network call.
      if (viewerTitle) viewerTitle.textContent = material.title || "ملف PDF";
      if (viewerPanel) {
        viewerPanel.hidden = false;
        viewerPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (viewerFrame) {
        viewerFrame.hidden = true;
        viewerFrame.src = "about:blank";
      }
      setViewerPlaceholder(skeletonRows(3));
      try {
        if (triggerButton) triggerButton.disabled = true;
        const data = await fetchJson(
          `/api/materials/${encodeURIComponent(material.id)}/download?mode=inline`,
          { headers: authHeaders() },
        );
        if (!viewerPanel || !viewerFrame) {
          window.open(data.downloadUrl, "_blank", "noopener");
          return;
        }
        setViewerPlaceholder(null);
        viewerFrame.hidden = false;
        viewerFrame.src = data.downloadUrl;
      } catch (error) {
        if (viewerFrame) {
          const box = setViewerPlaceholder(
            skeletonError(
              "تعذر تحميل الملف، حاولي مرة أخرى.",
              "إعادة المحاولة",
            ),
          );
          box
            ?.querySelector(".skeleton-retry-btn")
            ?.addEventListener("click", () =>
              openMaterialInViewer(material, null),
            );
        }
        showToast(error.message, "danger");
      } finally {
        if (triggerButton) triggerButton.disabled = false;
      }
    };

    const closePdfViewer = () => {
      if (!viewerPanel) return;
      const box = viewerFrame && viewerFrame.previousElementSibling;
      if (box && box.classList.contains("lesson-material-loading"))
        box.remove();
      viewerPanel.hidden = true;
      if (viewerFrame) viewerFrame.src = "about:blank";
    };

    if (viewerClose && viewerPanel) {
      viewerClose.addEventListener("click", closePdfViewer);
    }

    /** Renders the PDF materials list in the sidebar. */
    const renderLessonMaterials = (materialsList) => {
      if (!materialsBox) return;
      materialsBox.innerHTML = "";

      if (!materialsList.length) {
        materialsBox.innerHTML =
          '<p class="text-muted" style="font-size:0.9rem; margin:0;">لا توجد ملفات PDF لهذا الدرس بعد.</p>';
        return;
      }

      materialsList.forEach((material) => {
        const row = document.createElement("div");
        row.className = "lesson-material-item";

        const title = document.createElement("div");
        title.className = "lesson-material-title";
        title.textContent = material.title || "ملف PDF";

        const actionsBox = document.createElement("div");
        actionsBox.className = "lesson-material-actions";

        // عرض: renders the PDF inline beside/below the video player.
        const viewButton = document.createElement("button");
        viewButton.className = "btn btn-secondary lesson-material-download";
        viewButton.type = "button";
        viewButton.textContent = "عرض";
        viewButton.addEventListener("click", () =>
          openMaterialInViewer(material, viewButton),
        );

        const downloadButton = document.createElement("button");
        downloadButton.className = "btn btn-secondary lesson-material-download";
        downloadButton.type = "button";
        downloadButton.textContent = "تحميل";
        downloadButton.addEventListener("click", async () => {
          try {
            downloadButton.disabled = true;
            downloadButton.textContent = "جاري...";
            const data = await fetchJson(
              `/api/materials/${encodeURIComponent(material.id)}/download`,
              { headers: authHeaders() },
            );
            window.open(data.downloadUrl, "_blank", "noopener");
          } catch (error) {
            showToast(error.message, "danger");
          } finally {
            downloadButton.disabled = false;
            downloadButton.textContent = "تحميل";
          }
        });

        actionsBox.append(viewButton, downloadButton);
        row.append(title, actionsBox);
        materialsBox.appendChild(row);
      });
    };

    // ------------------------------------------------------------------
    // Stale-while-revalidate cache for lesson content. The site is a
    // multi-page app, so plain in-memory caches die on every navigation;
    // sessionStorage survives in-app navigation within the same tab —
    // exactly the "user came back moments ago" case. Within the TTL the
    // UI renders instantly from cache while a quiet background refetch
    // updates the cache (and UI only if something changed). Server-side
    // enrollment checks are untouched: this only skips redundant loading
    // spinners for already-fetched data.
    // ------------------------------------------------------------------
    const LESSON_CACHE_TTL_MS = 7 * 60 * 1000;

    const lessonCacheRead = (kind, id) => {
      try {
        const raw = sessionStorage.getItem(`lessonCache:${kind}:${id}`);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (!entry || typeof entry.fetchedAt !== "number") return null;
        return {
          data: entry.data,
          fresh: Date.now() - entry.fetchedAt < LESSON_CACHE_TTL_MS,
        };
      } catch (_) {
        return null;
      }
    };

    const lessonCacheWrite = (kind, id, data) => {
      try {
        sessionStorage.setItem(
          `lessonCache:${kind}:${id}`,
          JSON.stringify({ data, fetchedAt: Date.now() }),
        );
      } catch (_) {
        /* storage full/unavailable — caching stays best-effort */
      }
    };

    const cachedMaterials = lessonCacheRead("materials", lessonId);
    if (cachedMaterials && cachedMaterials.fresh) {
      renderLessonMaterials(cachedMaterials.data || []);
      fetchJson(`/api/lessons/${lessonId}/materials`, {
        headers: authHeaders(),
      })
        .then((freshData) => {
          const nextMaterials = freshData.materials || [];
          lessonCacheWrite("materials", lessonId, nextMaterials);
          if (
            JSON.stringify(nextMaterials) !==
            JSON.stringify(cachedMaterials.data)
          ) {
            renderLessonMaterials(nextMaterials);
          }
        })
        .catch(() => {
          /* keep showing cached list */
        });
    } else {
      if (materialsBox) materialsBox.innerHTML = skeletonRows(3);
      fetchJson(`/api/lessons/${lessonId}/materials`, {
        headers: authHeaders(),
      })
        .then((data) => {
          const materials = data.materials || [];
          lessonCacheWrite("materials", lessonId, materials);
          renderLessonMaterials(materials);
        })
        .catch((error) => {
          const box = document.querySelector("#lesson-materials-list");
          if (box) {
            box.innerHTML = skeletonError(
              "تعذر تحميل ملفات الدرس، حاولي مرة أخرى.",
              "إعادة المحاولة",
            );
            box
              .querySelector(".skeleton-retry-btn")
              ?.addEventListener("click", () => {
                box.innerHTML = skeletonRows(3);
                fetchJson(`/api/lessons/${lessonId}/materials`, {
                  headers: authHeaders(),
                })
                  .then((data) => {
                    renderLessonMaterials(data.materials || []);
                  })
                  .catch(() => {
                    if (box)
                      box.innerHTML =
                        '<p class="text-muted" style="font-size:0.9rem; margin:0;">تعذر تحميل ملفات الدرس.</p>';
                  });
              });
          }
          console.warn("[materials] list failed:", error);
        });
    }

    const applyVideosData = (data) => {
      lessonVideos = data.videos || [];

      if (!lessonVideos.length) {
        renderVideoSubtitle();
        if (durationEl) {
          durationEl.textContent = "لا يوجد فيديو مرفوع لهذا الدرس بعد";
        }
        return;
      }

      // Show the first ready video's real duration in the overlay.
      const readyVideo = lessonVideos.find((v) => v.ready);
      if (durationEl) {
        if (!readyVideo) {
          durationEl.textContent = "⏳ جاري معالجة الفيديو...";
        } else if (readyVideo.lengthSeconds) {
          durationEl.textContent = `⏱ ${formatDuration(readyVideo.lengthSeconds)}`;
        }
      }

      // Start from the first READY video (skip still-processing parts).
      const readyIdx = lessonVideos.findIndex((v) => v.ready);
      currentVideoIdx = readyIdx >= 0 ? readyIdx : 0;

      renderVideoSubtitle();
      renderVideoChooser();
      renderChapters(lessonVideos[currentVideoIdx]);
    };

    const cachedVideos = lessonCacheRead("videos", lessonId);
    if (cachedVideos && cachedVideos.fresh) {
      // The cache stores a bare array of videos (not the { videos } envelope),
      // so wrap it to match what applyVideosData expects.
      applyVideosData({ videos: cachedVideos.data });
      fetchJson(`/api/lessons/${lessonId}/videos`, {
        headers: authHeaders(),
      })
        .then((freshData) => {
          const nextVideos = freshData.videos || [];
          lessonCacheWrite("videos", lessonId, nextVideos);
          if (
            JSON.stringify(nextVideos) !== JSON.stringify(cachedVideos.data)
          ) {
            applyVideosData(freshData);
          }
        })
        .catch(() => {
          /* keep showing cached playlist */
        });
    } else {
      fetchJson(`/api/lessons/${lessonId}/videos`, {
        headers: authHeaders(),
      })
        .then((data) => {
          lessonCacheWrite("videos", lessonId, data.videos || []);
          applyVideosData(data);
        })
        .catch(() => {
          /* endpoint errors already surface when the user presses play */
        });
    }

    if (playBtn && playerBox) {
      playBtn.addEventListener("click", async () => {
        if (!lessonVideos.length) {
          showToast("لا يوجد فيديو مرفوع لهذا الدرس بعد.", "warning");
          return;
        }

        const videoEntry = lessonVideos[currentVideoIdx];
        if (!videoEntry.ready) {
          showToast(
            "الفيديو ما زال قيد المعالجة على Bunny، حاولي بعد قليل.",
            "warning",
          );
          return;
        }

        playBtn.disabled = true;
        showToast("جاري تشغيل الفيديو...", "success");
        loadIframe(videoEntry);
      });
    }

    // --- Teacher Notes (dynamic) ---
    const notesContainer = document.querySelector("#teacher-notes-container");
    const isTeacher = localStorage.getItem("userRole") === "teacher";

    const renderNotes = (notes) => {
      if (!notesContainer) return;
      notesContainer.innerHTML = "";

      if (isTeacher) {
        const addBox = document.createElement("div");
        addBox.className = "teacher-note-add-box";
        addBox.innerHTML = `
          <textarea id="new-note-input" class="form-input" rows="3" placeholder="أضيفي ملاحظة جديدة للطلاب..." style="width: 100%; margin-bottom: 0.75rem;"></textarea>
          <button id="btn-add-note" class="btn btn-primary" style="min-width: 120px;">إضافة ملاحظة</button>
        `;
        notesContainer.appendChild(addBox);

        addBox
          .querySelector("#btn-add-note")
          .addEventListener("click", async () => {
            const input = addBox.querySelector("#new-note-input");
            const content = input.value.trim();
            if (!content) {
              showToast("اكتب الملاحظة أولاً.", "warning");
              return;
            }
            try {
              await fetchJson(`/api/lessons/${lessonId}/notes`, {
                method: "POST",
                headers: {
                  ...authHeaders(),
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ content }),
              });
              input.value = "";
              showToast("تم إضافة الملاحظة بنجاح.", "success");
              loadNotes();
            } catch (err) {
              showToast(err.message, "danger");
            }
          });
      }

      if (!notes.length && !isTeacher) {
        notesContainer.innerHTML =
          '<p class="text-muted" style="font-size: 0.9rem;">لا توجد ملاحظات من المعلمة لهذا الدرس بعد.</p>';
        return;
      }

      notes.forEach((note) => {
        const card = document.createElement("div");
        card.className = "teacher-note-card";
        card.innerHTML = `
          <div class="teacher-note-content">${note.content}</div>
          <div class="teacher-note-meta">${new Date(note.createdAt).toLocaleDateString("ar-EG")}</div>
        `;
        if (isTeacher) {
          const actions = document.createElement("div");
          actions.className = "teacher-note-actions";
          actions.innerHTML = `
            <button class="btn btn-secondary btn-sm note-edit-btn">تعديل</button>
            <button class="btn btn-secondary btn-sm note-delete-btn" style="color: var(--color-danger);">حذف</button>
          `;
          actions
            .querySelector(".note-edit-btn")
            .addEventListener("click", () => {
              const contentEl = card.querySelector(".teacher-note-content");
              const currentText = contentEl.textContent;
              contentEl.innerHTML = `<textarea class="form-input note-edit-textarea" rows="2" style="width:100%; margin-bottom:0.5rem;">${currentText}</textarea>
              <button class="btn btn-primary btn-sm note-save-btn">حفظ</button>
              <button class="btn btn-secondary btn-sm note-cancel-btn">إلغاء</button>`;
              actions.remove();
              contentEl
                .querySelector(".note-save-btn")
                .addEventListener("click", async () => {
                  const newContent = contentEl
                    .querySelector(".note-edit-textarea")
                    .value.trim();
                  if (!newContent) return;
                  try {
                    await fetchJson(`/api/notes/${note.id}`, {
                      method: "PATCH",
                      headers: {
                        ...authHeaders(),
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({ content: newContent }),
                    });
                    showToast("تم تحديث الملاحظة.", "success");
                    loadNotes();
                  } catch (err) {
                    showToast(err.message, "danger");
                  }
                });
              contentEl
                .querySelector(".note-cancel-btn")
                .addEventListener("click", () => loadNotes());
            });
          actions
            .querySelector(".note-delete-btn")
            .addEventListener("click", async () => {
              const confirmed = await showConfirmModal(
                "هل أنت متأكد من حذف هذه الملاحظة؟",
              );
              if (!confirmed) return;
              try {
                await fetchJson(`/api/notes/${note.id}`, {
                  method: "DELETE",
                  headers: authHeaders(),
                });
                showToast("تم حذف الملاحظة.", "success");
                loadNotes();
              } catch (err) {
                showToast(err.message, "danger");
              }
            });
          card.appendChild(actions);
        }
        notesContainer.appendChild(card);
      });
    };

    const loadNotes = async () => {
      try {
        const data = await fetchJson(`/api/lessons/${lessonId}/notes`, {
          headers: authHeaders(),
        });
        renderNotes(data.notes || []);
      } catch (err) {
        if (notesContainer)
          notesContainer.innerHTML =
            '<p class="text-muted" style="font-size: 0.9rem;">تعذر تحميل الملاحظات.</p>';
      }
    };
    loadNotes();

    // --- Lesson Exams Tab ---
    const examsContainer = document.querySelector("#lesson-exams-container");
    let lessonExamsLoaded = false;

    const statusLabel = (status) => {
      if (status === "upcoming") return "قادم";
      if (status === "active") return "نشط";
      return "منتهي";
    };

    const renderLessonExams = (exams, attempts) => {
      if (!examsContainer) return;
      examsContainer.innerHTML = "";

      if (!exams.length) {
        examsContainer.innerHTML =
          '<p class="text-muted" style="font-size: 0.9rem;">لا توجد امتحانات متاحة لهذا الدرس حاليًا.</p>';
        return;
      }

      exams.forEach((exam) => {
        const attempt = attempts[exam.id] || {};
        const card = document.createElement("div");
        card.className = "lesson-exam-card";

        const titleRow = document.createElement("div");
        titleRow.style.cssText =
          "display:flex; align-items:center; justify-content:space-between; gap:0.6rem;";

        const title = document.createElement("span");
        title.className = "lesson-exam-title";
        title.textContent = exam.title;

        const status = document.createElement("span");
        status.className = `lesson-exam-status status-${exam.status}`;
        status.textContent = statusLabel(exam.status);

        titleRow.append(title, status);

        const meta = document.createElement("div");
        meta.className = "lesson-exam-meta";
        meta.innerHTML = `<span>${exam.questionCount} سؤال</span><span>${exam.durationMinutes} دقيقة</span>`;
        if (exam.isMixed) {
          meta.innerHTML += "<span>اختبار مجمع</span>";
        }

        const foot = document.createElement("div");
        foot.className = "lesson-exam-foot";

        // Score chip for completed attempts
        if (attempt.status === "submitted" && attempt.latestSubmitted) {
          const score = document.createElement("span");
          score.className = "lesson-exam-score";
          score.textContent = `${attempt.latestSubmitted.score}/${attempt.latestSubmitted.totalMcq}`;
          foot.appendChild(score);
        }

        // Action button
        if (exam.status === "active") {
          const canStart =
            attempt.status === "not_started" ||
            attempt.status === "in_progress" ||
            (attempt.status === "submitted" && attempt.remainingAttempts > 0);
          if (canStart) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn btn-primary btn-take";
            btn.dataset.id = exam.id;
            btn.style.cssText = "font-size:0.85rem; padding:0.4rem 1rem;";
            btn.textContent =
              attempt.status === "in_progress"
                ? "استئناف الاختبار"
                : "بدء الاختبار";
            foot.appendChild(btn);
          } else if (
            attempt.status === "submitted" &&
            attempt.remainingAttempts === 0
          ) {
            const resultBtn = document.createElement("button");
            resultBtn.type = "button";
            resultBtn.className = "btn btn-secondary btn-result";
            resultBtn.dataset.id = exam.id;
            resultBtn.style.cssText = "font-size:0.85rem; padding:0.4rem 1rem;";
            resultBtn.textContent = "عرض النتيجة";
            foot.appendChild(resultBtn);
          }
        } else if (
          exam.status === "ended" &&
          attempt.status === "submitted" &&
          attempt.latestSubmitted
        ) {
          const resultBtn = document.createElement("button");
          resultBtn.type = "button";
          resultBtn.className = "btn btn-secondary btn-result";
          resultBtn.dataset.id = exam.id;
          resultBtn.style.cssText = "font-size:0.85rem; padding:0.4rem 1rem;";
          resultBtn.textContent = "عرض النتيجة";
          foot.appendChild(resultBtn);
        }

        card.append(titleRow, meta, foot);
        examsContainer.appendChild(card);
      });
    };

    window.refreshLessonExams = async () => {
      try {
        const data = await fetchJson(`/api/quizzes/for-lesson/${lessonId}`, {
          headers: authHeaders(),
        });
        renderLessonExams(data.exams || [], data.attempts || {});
      } catch (err) {
        console.error("[lesson exams] refresh failed:", err);
        if (examsContainer)
          examsContainer.innerHTML = skeletonError(
            "تعذر تحميل امتحانات الدرس، حاولي مرة أخرى.",
            "إعادة المحاولة",
          );
        examsContainer
          ?.querySelector(".skeleton-retry-btn")
          ?.addEventListener("click", window.refreshLessonExams);
      }
    };

    const loadLessonExams = async () => {
      if (lessonExamsLoaded) return;
      lessonExamsLoaded = true;
      // The Exams tab is already active/visible — show a skeleton inside it
      // immediately while the fetch runs.
      if (examsContainer && !examsContainer.childElementCount) {
        examsContainer.innerHTML = skeletonRows(3);
      }
      await window.refreshLessonExams();
    };

    // Lazy-load exams when the Exams tab is clicked
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.getAttribute("data-tab") === "tab-exams") {
          loadLessonExams();
        }
      });
    });
  }

  // --- Teacher dashboard: video & PDF upload dependent dropdowns ---
  const chapterSelect = document.querySelector("#upload-chapter");
  const lessonSelect = document.querySelector("#upload-lesson");
  const pdfChapterSelect = document.querySelector("#upload-pdf-chapter");
  const pdfLessonSelect = document.querySelector("#upload-pdf-lesson");

  const initCurriculumSelects = (chapterSel, lessonSel) => {
    if (!chapterSel || !lessonSel || !window.CURRICULUM) return;

    const fillLessons = (chapterIdx) => {
      const chapter = window.CURRICULUM.biology[chapterIdx];
      lessonSel.innerHTML = "";
      chapter.lessons.forEach((lesson) => {
        const opt = document.createElement("option");
        opt.value = lesson.id;
        opt.textContent = `${chapter.name.split(":")[0]} — ${lesson.name} (${lesson.id})`;
        lessonSel.appendChild(opt);
      });
    };

    window.CURRICULUM.biology.forEach((chapter, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = chapter.name;
      chapterSel.appendChild(opt);
    });

    chapterSel.addEventListener("change", () =>
      fillLessons(Number(chapterSel.value)),
    );
    fillLessons(0);
  };

  if (chapterSelect && lessonSelect) {
    initCurriculumSelects(chapterSelect, lessonSelect);
  }
  if (pdfChapterSelect && pdfLessonSelect) {
    initCurriculumSelects(pdfChapterSelect, pdfLessonSelect);
  }

  const uploadBtn = document.querySelector("#btn-upload-video");
  const uploadMaterialBtn = document.querySelector("#btn-upload-material");
  const uploadSelectedMaterial = async (onProgress) => {
    const titleInput = document.querySelector("#upload-pdf-title");
    const pdfInput = document.querySelector("#upload-pdf-file");
    const pdfLessonSelect = document.querySelector("#upload-pdf-lesson");
    const lessonId = pdfLessonSelect ? pdfLessonSelect.value : "";
    const pdfFile = pdfInput?.files[0];

    if (!lessonId) {
      showToast("اختاري الفصل والدرس أولاً.", "warning");
      return null;
    }

    if (!pdfFile) {
      showToast("من فضلك اختاري ملف PDF أولاً", "warning");
      return null;
    }

    if (pdfFile.type !== "application/pdf" && !/\.pdf$/i.test(pdfFile.name)) {
      showToast("ملفات PDF فقط مسموح بها.", "warning");
      return null;
    }

    if ((localStorage.getItem("userRole") || "student") !== "teacher") {
      showToast("رفع ملفات PDF متاح لحساب المعلمة فقط.", "danger");
      return null;
    }

    const formDataTitle = (titleInput?.value || pdfFile.name).trim();

    // Auth: JWT Bearer token from the shared helper (no client-trusted role
    // headers — the backend decides who may upload).
    // ------------------------------------------------------------------
    // DIRECT UPLOAD (3 phases). Vercel caps function request bodies at
    // ~4.5MB, so the PDF bytes must never pass through our API:
    //   1. ask our API for a short-lived signed Supabase upload URL
    //   2. PUT the file straight to Supabase (progress reported here)
    //   3. tell our API to register the material (+ normalize server-side)
    // ------------------------------------------------------------------
    const prepared = await fetchJson(
      `/api/lessons/${encodeURIComponent(lessonId)}/materials/upload-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ fileName: pdfFile.name }),
      },
    );

    let result;
    if (swUploadAvailable) {
      // BACKGROUND PATH: hand the whole upload (bytes PUT + finalize) to the
      // service worker so navigating to other pages cannot interrupt it.
      const jobId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const workflow = {
        jobId,
        kind: "pdf",
        lessonId,
        filePath: prepared.filePath,
        label: `PDF: ${formDataTitle}`,
        phase: "uploading",
        progress: 0,
      };
      saveUploadWorkflow(workflow);

      const outcome = await startSwUploadJob({
        id: jobId,
        kind: "pdf",
        url: prepared.signedUrl,
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        blob: pdfFile,
        finalize: {
          url: `/api/materials/finalize`,
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            lessonId,
            filePath: prepared.filePath,
            title: formDataTitle,
          }),
        },
        meta: { ...workflow },
        status: "queued",
      });

      if (!outcome.ok) {
        throw new Error(outcome.error || "فشل رفع ملف PDF.");
      }
      saveUploadWorkflow({ ...workflow, phase: "completed", progress: 100 });
      result = {};
    } else {
      // INLINE FALLBACK (no service worker): classic in-page XHR upload.
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", prepared.signedUrl);
        xhr.setRequestHeader("Content-Type", "application/pdf");

        if (typeof onProgress === "function") {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              onProgress(Math.round((e.loaded / e.total) * 100), null);
            }
          });
        }

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`فشل رفع الملف (${xhr.status}).`));
          }
        });

        xhr.addEventListener("error", () =>
          reject(new Error("انقطع الاتصال أثناء رفع ملف PDF.")),
        );

        xhr.send(pdfFile);
      });

      if (typeof onProgress === "function")
        onProgress(100, "جاري تحسين الملف على السيرفر...");

      result = await fetchJson(`/api/materials/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          lessonId,
          filePath: prepared.filePath,
          title: formDataTitle,
        }),
      });
    }

    // Invalidate the lesson-view cache for this lesson so the next visit
    // fetches a fresh list that includes the new PDF (otherwise the cached
    // pre-upload list would keep hiding it for up to 7 minutes).
    try {
      sessionStorage.removeItem(`lessonCache:materials:${lessonId}`);
    } catch (_) {
      /* best-effort */
    }

    pdfInput.value = "";
    showToast("تم رفع ملف PDF للدرس بنجاح.", "success");
    return result;
  };

  if (uploadMaterialBtn) {
    uploadMaterialBtn.addEventListener("click", async () => {
      const pdfInput = document.querySelector("#upload-pdf-file");
      const pdfFile = pdfInput?.files[0];
      if (!pdfFile) {
        showToast("من فضلك اختاري ملف PDF أولاً", "warning");
        return;
      }

      const titleInput = document.querySelector("#upload-pdf-title");
      if (!titleInput || !titleInput.value.trim()) {
        showToast("اكتبي اسم ملف PDF.", "warning");
        if (titleInput) titleInput.focus();
        return;
      }

      const progressArea = document.querySelector("#upload-pdf-progress-area");
      const progressBar = document.querySelector("#upload-pdf-progress-bar");
      const statusText = document.querySelector("#upload-pdf-status-text");

      try {
        uploadMaterialBtn.disabled = true;
        UploadFloat.show("جاري رفع ملف PDF");
        if (progressArea && progressBar && statusText) {
          progressArea.style.display = "block";
          progressBar.style.width = "0%";
          statusText.textContent = "جاري تجهيز الملف...";
        }

        const result = await uploadSelectedMaterial((pct, statusMsg) => {
          if (progressBar && statusText) {
            progressBar.style.width = pct + "%";
            statusText.textContent =
              statusMsg || `جاري رفع ملف الـ PDF... ${pct}%`;
          }
          UploadFloat.update(
            pct,
            statusMsg || `جاري رفع ملف الـ PDF... ${pct}%`,
          );
        });

        if (result) {
          if (progressBar && statusText) {
            progressBar.style.width = "100%";
            statusText.textContent = "تم رفع ملف PDF للدرس بنجاح ✔";
          }
          UploadFloat.done("تم رفع ملف PDF للدرس بنجاح ✔");
          if (titleInput) titleInput.value = "";
        }
      } catch (error) {
        showToast(error.message, "danger");
        if (statusText) statusText.textContent = "فشل رفع ملف PDF.";
        UploadFloat.fail("فشل رفع ملف PDF.");
      } finally {
        uploadMaterialBtn.disabled = false;
      }
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {
      const titleInput = document.querySelector("#upload-title");
      const fileInput = document.querySelector("#upload-file");
      const progressArea = document.querySelector("#upload-progress-area");
      const progressBar = document.querySelector("#upload-progress-bar");
      const statusText = document.querySelector("#upload-status-text");

      const lessonId = lessonSelect ? lessonSelect.value : "";
      const videoName = (titleInput?.value || "").trim();
      const file = fileInput?.files[0];

      if (!lessonId) {
        showToast("اختاري الفصل والدرس أولاً.", "warning");
        return;
      }
      if (!videoName) {
        showToast("اكتبي اسم الفيديو.", "warning");
        titleInput.focus();
        return;
      }
      if (!file) {
        showToast("من فضلك اختاري ملف الفيديو أولاً", "warning");
        return;
      }

      // Only teachers may upload (UI hint only — the backend enforces the
      // real role from the JWT).
      if ((localStorage.getItem("userRole") || "student") !== "teacher") {
        showToast("رفع الفيديوهات متاح لحساب المعلمة فقط.", "danger");
        return;
      }

      try {
        uploadBtn.disabled = true;
        progressArea.style.display = "block";
        progressBar.style.width = "0%";
        statusText.textContent = "جاري تجهيز الفيديو على سيرفر البث...";
        UploadFloat.show("جاري رفع الفيديو");
        UploadFloat.update(0, "جاري تجهيز الفيديو على سيرفر البث...");

        // Step 1: reserve a slot on Bunny (title follows the lesson convention).
        const prepared = await fetchJson(`/api/lessons/${lessonId}/video`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            title: videoName,
          }),
        });

        // Step 2: PUT the raw file straight to Bunny with upload progress.
        if (swUploadAvailable) {
          // BACKGROUND PATH: the service worker owns the big video PUT, so
          // the teacher can browse other pages while it runs. Bunny encodes
          // server-side afterwards regardless of who is watching.
          const jobId =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const workflow = {
            jobId,
            kind: "video",
            lessonId,
            videoId: prepared.videoId,
            label: `فيديو: ${videoName}`,
            phase: "uploading",
            progress: 0,
          };
          saveUploadWorkflow(workflow);

          const outcome = await startSwUploadJob({
            id: jobId,
            kind: "video",
            url: prepared.uploadUrl,
            method: "PUT",
            headers: { AccessKey: prepared.accessKey },
            blob: file,
            meta: { ...workflow },
            status: "queued",
          });

          if (!outcome.ok) {
            const rawError = String(outcome.error || "");
            if (/failed to fetch|networkerror|load failed/i.test(rawError)) {
              throw new Error(
                "انقطع الاتصال أثناء رفع الفيديو. تأكدي من الشبكة وحاولي مرة أخرى.",
              );
            }
            throw new Error(outcome.error || "فشل رفع الملف.");
          }
          saveUploadWorkflow({
            ...workflow,
            phase: "processing",
            progress: 100,
          });
        } else {
          // INLINE FALLBACK (no service worker).
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", prepared.uploadUrl);
            xhr.setRequestHeader("AccessKey", prepared.accessKey);
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                progressBar.style.width = pct + "%";
                statusText.textContent = `جاري رفع الملف... ${pct}%`;
                UploadFloat.update(pct, `جاري رفع الملف... ${pct}%`);
              }
            });
            xhr.addEventListener("load", () =>
              xhr.status >= 200 && xhr.status < 300
                ? resolve()
                : reject(new Error(`فشل رفع الملف (${xhr.status}).`)),
            );
            xhr.addEventListener("error", () =>
              reject(new Error("انقطع الاتصال أثناء الرفع.")),
            );
            xhr.send(file);
          });
        }

        statusText.textContent = "تم الرفع! جاري معالجة الفيديو على Bunny...";

        // Step 3: poll encoding status until the video is watchable.
        // A single failed poll (network blip, radio handoff, laptop sleep)
        // must NOT abort the flow — the upload itself already succeeded and
        // Bunny keeps encoding. Only give up after several consecutive
        // failures.
        let pollFailures = 0;
        const MAX_POLL_FAILURES = 6;
        const poll = setInterval(async () => {
          try {
            const st = await fetchJson(
              `/api/lessons/${lessonId}/video-status`,
              { headers: authHeaders() },
            );
            pollFailures = 0;
            progressBar.style.width = Math.max(st.encodeProgress || 0, 5) + "%";
            UploadFloat.update(
              Math.max(st.encodeProgress || 0, 5),
              "جاري معالجة الفيديو على Bunny...",
            );

            if (st.ready) {
              clearInterval(poll);
              progressBar.style.width = "100%";
              statusText.textContent = "الفيديو جاهز ✅ — تم الرفع بنجاح";
              showToast(
                "تم رفع الفيديو بنجاح! الطلاب يستطيعون مشاهدته الآن.",
                "success",
              );
              UploadFloat.done("الفيديو جاهز ✅");
              uploadBtn.disabled = false;
            } else if ([5, 6].includes(st.status)) {
              clearInterval(poll);
              statusText.textContent = "فشلت معالجة الفيديو على Bunny.";
              showToast("فشلت معالجة الفيديو، حاولي رفعه مرة أخرى.", "danger");
              UploadFloat.fail("فشلت معالجة الفيديو.");
              uploadBtn.disabled = false;
            }
          } catch (pollError) {
            pollFailures += 1;
            if (pollFailures >= MAX_POLL_FAILURES) {
              clearInterval(poll);
              statusText.textContent =
                "انقطعت المراقبة أثناء معالجة الفيديو، لكن الملف مرفوع. حدّثي صفحة الدرس بعد قليل للتحقق.";
              showToast(
                "فقدنا الاتصال بمراقبة المعالجة. الملف مرفوع على Bunny وسيظهر في الدرس عند جهوزه.",
                "warning",
              );
              UploadFloat.fail("انقطعت مراقبة المعالجة.");
              uploadBtn.disabled = false;
            } else {
              statusText.textContent = `تعذر التحقق مؤقتاً — سنعيد المحاولة (${pollFailures}/${MAX_POLL_FAILURES})...`;
            }
          }
        }, 5000);
      } catch (error) {
        showToast(error.message, "danger");
        progressArea.style.display = "none";
        UploadFloat.fail(error.message);
        uploadBtn.disabled = false;
      }
    });
  }

  // --- Teacher dashboard: manage already-uploaded videos (edit / delete) ---
  const manageChapter = document.querySelector("#manage-chapter");
  const manageLesson = document.querySelector("#manage-lesson");

  if (manageChapter && manageLesson && window.CURRICULUM) {
    const fillManageLessons = (chapterIdx) => {
      const chapter = window.CURRICULUM.biology[chapterIdx];
      manageLesson.innerHTML = "";
      chapter.lessons.forEach((lesson) => {
        const opt = document.createElement("option");
        opt.value = lesson.id;
        opt.textContent = `${lesson.name} (${lesson.id})`;
        manageLesson.appendChild(opt);
      });
      // Also refresh the "move to lesson" dropdown in the edit form.
      const moveSelect = document.querySelector("#edit-move-lesson");
      if (moveSelect) {
        moveSelect.innerHTML =
          '<option value="">— إبقاء الدرس الحالي —</option>';
        window.CURRICULUM.biology.forEach((ch) => {
          ch.lessons.forEach((l) => {
            const o = document.createElement("option");
            o.value = l.id;
            o.textContent = `${ch.name.split(":")[0]} — ${l.name}`;
            moveSelect.appendChild(o);
          });
        });
      }
    };

    window.CURRICULUM.biology.forEach((chapter, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = chapter.name;
      manageChapter.appendChild(opt);
    });
    manageChapter.addEventListener("change", () =>
      fillManageLessons(Number(manageChapter.value)),
    );
    fillManageLessons(0);

    const editForm = document.querySelector("#video-edit-form");
    const videosListBox = document.querySelector("#manage-videos-list");
    let loadedVideos = [];

    // Loads Bunny's OFFICIAL playerjs client library (from Bunny's CDN) once.
    // Bunny's Stream embed player is designed to be driven through this
    // library, so we attach to it the moment it is available.
    let playerJsLibPromise = null;
    const ensurePlayerJs = () => {
      if (playerJsLibPromise) return playerJsLibPromise;
      playerJsLibPromise = new Promise((resolve) => {
        if (window.playerjs) return resolve(true);
        const script = document.createElement("script");
        script.src =
          "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js";
        script.async = true;
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve(!!window.playerjs);
        };
        script.onload = done;
        script.onerror = done;
        setTimeout(done, 5000);
        document.head.appendChild(script);
      });
      return playerJsLibPromise;
    };

    const renderVideoChaptersPanel = (videoObj, panelEl) => {
      panelEl.innerHTML = "";
      // Stop any previous time-ticker still bound to this panel (each open
      // rebuilds the player and starts a fresh one).
      if (panelEl.__stopTimeTicker) {
        panelEl.__stopTimeTicker();
        panelEl.__stopTimeTicker = null;
      }

      // Local temporary running list (seeded from already-saved chapters).
      // Nothing is written to the DB until "حفظ التقسيم" is clicked.
      const markers = (videoObj.chapters || [])
        .map((ch) => ({
          title: ch.title,
          startTimeSeconds: ch.startTimeSeconds,
        }))
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex; flex-direction:column; gap:0.85rem;";

      // --- 1) Video player for this specific video ---
      const playerBox = document.createElement("div");
      playerBox.style.cssText =
        "position:relative; aspect-ratio:16/9; background:#000; border-radius:var(--radius-md); overflow:hidden; border:1px solid var(--color-border);";
      // player.js needs a unique iframe src per player instance, otherwise
      // reopening the same video's panel can collide with the previous one.
      const playerSrcNonce = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      const playerSrc = `${videoObj.playbackUrl}${
        videoObj.playbackUrl.indexOf("?") !== -1 ? "&" : "?"
      }t=${playerSrcNonce}`;
      playerBox.innerHTML = `<iframe id="chapters-preview-player" src="${playerSrc}" style="width:100%; height:100%; border:0; position:absolute; inset:0;" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      wrap.appendChild(playerBox);

      // --- Helper: read the player's CURRENT time via the Bunny player API ---
      // Bunny's embedded player speaks the player.js protocol (its timeupdate
      // data is a JSON string: "{\"seconds\":12.4,\"duration\":60}"). We drive
      // it with Bunny's OFFICIAL playerjs library (window.playerjs) — the
      // documented, reliable path — and keep a raw postMessage listener/poller
      // as a fallback. However the time arrives, `lastKnownTime` stays fresh so
      // clicking "add marker" captures the exact current (or paused) position
      // instantly — the teacher never types a time.
      let lastKnownTime = null;
      let playerObj = null;
      const videoIframe = playerBox.querySelector("iframe");

      // Shared update point for every capture path (library + raw messages).
      const rememberTime = (rawSeconds) => {
        const numeric = extractSeconds(rawSeconds);
        if (numeric === null || !Number.isFinite(numeric)) return;
        lastKnownTime = Math.max(0, Math.floor(numeric));
        if (liveTimeLabel) {
          liveTimeLabel.textContent = formatDuration(lastKnownTime);
        }
      };

      // Pulls a seconds value out of the many shapes the player can send
      // (a number, a numeric string, or a JSON string / object with `seconds`).
      const extractSeconds = (payload) => {
        if (payload === null || payload === undefined) return null;
        if (typeof payload === "number") {
          return Number.isFinite(payload) ? payload : null;
        }
        if (typeof payload === "string") {
          const trimmed = payload.trim();
          if (trimmed === "") return null;
          if (Number.isFinite(Number(trimmed))) return Number(trimmed);
          try {
            return extractSeconds(JSON.parse(trimmed));
          } catch (e) {
            return null;
          }
        }
        if (typeof payload === "object") {
          if (payload.seconds !== undefined)
            return extractSeconds(payload.seconds);
          if (payload.currentTime !== undefined)
            return extractSeconds(payload.currentTime);
          if (payload.time !== undefined) return extractSeconds(payload.time);
          if (payload.properties !== undefined)
            return extractSeconds(payload.properties);
          if (payload.data !== undefined) return extractSeconds(payload.data);
          if (payload.value !== undefined) return extractSeconds(payload.value);
        }
        return null;
      };

      // Official flow: once the library is present, wrap this video's iframe
      // and subscribe to ready + timeupdate; the ticker also polls via the API.
      const attachOfficialPlayer = () => {
        if (playerObj || !videoIframe || !window.playerjs) return;
        try {
          playerObj = new window.playerjs.Player(videoIframe);
          playerObj.on("ready", () => {
            if (captureStatus) {
              captureStatus.textContent = "✓ متصل بالفيديو";
              captureStatus.title = "جهاز التوقيت متصل بمشغل Bunny.";
            }
            askCurrentTime();
          });
          playerObj.on("timeupdate", (payload) => rememberTime(payload));
          playerObj.on("error", (error) => {
            console.error("[chapters] playerjs error:", error);
          });
        } catch (error) {
          console.error("[chapters] playerjs init failed:", error);
          playerObj = null;
        }
      };
      // Wait for the library to load (async) and attach as soon as it exists.
      ensurePlayerJs().then(attachOfficialPlayer);
      // Safety net: if the script finishes loading after the wait resolved,
      // attach on a later tick too.
      setTimeout(() => {
        if (window.playerjs && !playerObj) attachOfficialPlayer();
      }, 6000);

      // Raw fallback listener: captures time from THIS iframe's messages even
      // if the official library never loads.
      const onPlayerMessage = (event) => {
        try {
          if (
            !videoIframe ||
            !videoIframe.contentWindow ||
            !event.source ||
            event.source !== videoIframe.contentWindow
          ) {
            return;
          }
          const data =
            typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          if (!data) return;
          const context = String(data.context || "");
          if (
            context !== "player.js" &&
            context !== "iframe.mediadelivery.net"
          ) {
            return;
          }
          rememberTime(data.value !== undefined ? data.value : data.data);
        } catch (e) {}
      };
      window.addEventListener("message", onPlayerMessage);

      // Ticker: keep asking the player for its current time every 400ms —
      // through the official API when attached, raw postMessage otherwise.
      const askCurrentTime = () => {
        if (playerObj) {
          try {
            playerObj.getCurrentTime((value) => rememberTime(value));
            return true;
          } catch (e) {}
        }
        try {
          if (videoIframe && videoIframe.contentWindow) {
            videoIframe.contentWindow.postMessage(
              JSON.stringify({
                context: "player.js",
                method: "getCurrentTime",
              }),
              "*",
            );
            return true;
          }
        } catch (e) {}
        return false;
      };

      const timeTicker = setInterval(() => {
        if (document.visibilityState === "visible") askCurrentTime();
      }, 400);

      // Cleanup on panel close / re-open so listeners never accumulate.
      panelEl.__stopTimeTicker = () => {
        window.removeEventListener("message", onPlayerMessage);
        clearInterval(timeTicker);
        playerObj = null;
      };

      // --- 2) "Add marker here" bar (captures current paused timestamp) ---
      const markerBar = document.createElement("div");
      markerBar.style.cssText =
        "display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; background:var(--color-bg); padding:0.6rem 0.8rem; border-radius:var(--radius-md); border:1px dashed var(--color-accent-blue);";
      markerBar.innerHTML =
        `<button type="button" id="add-marker-btn" class="btn btn-primary" style="font-size:0.85rem; border-radius:50px;">🚩 ＋ إضافة علامة هنا</button>` +
        `<span style="font-size:0.78rem; flex:1; min-width:150px;">شغّلي الفيديو وأوقفي عند اللحظة المطلوبة ثم اضغطي الزر لالتقاط التوقيت الحالي تلقائياً.</span>` +
        `<span class="text-muted" style="font-size:0.78rem; white-space:nowrap; font-variant-numeric:tabular-nums;" title="الوقت الحالي المقروء من الفيديو">⏱ <span id="live-time-label" style="font-weight:700;">0:00</span></span>` +
        `<span id="chapters-capture-status" class="text-muted" style="font-size:0.72rem; white-space:nowrap;" title="حالة اتصال المشغل">جاري الاتصال بالمشغل…</span>`;
      wrap.appendChild(markerBar);

      // Inline title-capture row (hidden until a marker is captured).
      const titleRow = document.createElement("div");
      titleRow.style.cssText =
        "display:none; align-items:center; gap:0.5rem; flex-wrap:wrap; background:var(--color-surface); border:1px solid var(--color-border); padding:0.6rem 0.8rem; border-radius:var(--radius-md);";
      titleRow.innerHTML =
        `<span style="font-size:0.85rem; font-weight:700; white-space:nowrap;">⏱ <span id="captured-time-label">—</span></span>` +
        `<input id="marker-title-input" type="text" placeholder="عنوان العلامة (مثال: سؤال 1)" autocomplete="off" style="flex:2; min-width:150px; padding:0.4rem 0.6rem; border:1px solid var(--color-border); border-radius:var(--radius-sm); font-size:0.85rem;">` +
        `<button type="button" id="marker-confirm-btn" class="btn btn-success" style="font-size:0.8rem; border-radius:var(--radius-sm);">إضافة</button>` +
        `<button type="button" id="marker-cancel-btn" class="btn btn-light" style="font-size:0.8rem; border-radius:var(--radius-sm);">إلغاء</button>`;
      wrap.appendChild(titleRow);

      // --- 3) Running (temporary) list ---
      const listTitle = document.createElement("h5");
      listTitle.style.cssText = "font-size:0.9rem; font-weight:700; margin:0;";
      listTitle.textContent = `📋 علامات الفيديو الحالية (${markers.length})`;
      wrap.appendChild(listTitle);

      const listBox = document.createElement("div");
      listBox.style.cssText =
        "display:flex; flex-direction:column; gap:0.4rem; max-height:260px; overflow-y:auto; padding-inline-end:0.25rem;";
      wrap.appendChild(listBox);

      const renderList = () => {
        listTitle.textContent = `📋 علامات الفيديو الحالية (${markers.length})`;
        listBox.innerHTML = "";
        if (!markers.length) {
          listBox.innerHTML =
            '<p class="text-muted" style="font-size:0.8rem; margin:0;">لا توجد علامات مضافة بعد. أضف علاماتك ثم اضغط «حفظ التقسيم».</p>';
          return;
        }
        markers.forEach((m, idx) => {
          const row = document.createElement("div");
          row.style.cssText =
            "display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0.6rem; background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-sm); font-size:0.8rem; gap:0.5rem;";
          const textSpan = document.createElement("span");
          textSpan.style.cssText = "font-weight:600; flex:1; min-width:0;";
          textSpan.textContent = `${m.title} — ${formatDuration(m.startTimeSeconds)}`;
          const itemActions = document.createElement("div");
          itemActions.style.cssText =
            "display:flex; gap:0.25rem; flex-shrink:0;";
          itemActions.innerHTML =
            `<button class="btn btn-light js-mk-edit" style="font-size:0.7rem; padding:0.2rem 0.4rem;" title="تعديل">✏️</button>` +
            `<button class="btn btn-light js-mk-del" style="font-size:0.7rem; padding:0.2rem 0.4rem; color:var(--color-danger);" title="حذف">🗑</button>`;
          row.append(textSpan, itemActions);

          itemActions
            .querySelector(".js-mk-del")
            .addEventListener("click", () => {
              markers.splice(idx, 1);
              renderList();
            });

          itemActions
            .querySelector(".js-mk-edit")
            .addEventListener("click", () => {
              textSpan.innerHTML =
                `<input type="text" class="mk-edit-input" value="${m.title}" autocomplete="off" style="flex:1; min-width:120px; padding:0.3rem 0.5rem; border:1px solid var(--color-border); border-radius:var(--radius-sm); font-size:0.8rem;">` +
                `<button class="btn btn-success mk-edit-save" style="font-size:0.7rem; padding:0.2rem 0.5rem; margin-inline-start:0.3rem;">حفظ</button>` +
                `<button class="btn btn-light mk-edit-cancel" style="font-size:0.7rem; padding:0.2rem 0.5rem;">إلغاء</button>`;
              const input = textSpan.querySelector(".mk-edit-input");
              input.focus();
              const done = (save) => {
                if (save && !input.value.trim()) return;
                if (save) m.title = input.value.trim();
                renderList();
              };
              textSpan
                .querySelector(".mk-edit-save")
                .addEventListener("click", () => done(true));
              textSpan
                .querySelector(".mk-edit-cancel")
                .addEventListener("click", () => done(false));
              input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  done(true);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  done(false);
                }
              });
            });

          listBox.appendChild(row);
        });
      };

      // --- 4) Marker capture + inline title commit ---
      // Timestamp is captured AUTOMATICALLY from the background ticker's last
      // known playback position, so the teacher only types a title.
      let capturedTime = null;
      const addMarkerBtn = wrap.querySelector("#add-marker-btn");
      const titleInput = wrap.querySelector("#marker-title-input");
      const confirmBtn = wrap.querySelector("#marker-confirm-btn");
      const cancelBtn = wrap.querySelector("#marker-cancel-btn");
      const capturedLabel = wrap.querySelector("#captured-time-label");
      const liveTimeLabel = wrap.querySelector("#live-time-label");
      const captureStatus = wrap.querySelector("#chapters-capture-status");

      addMarkerBtn.addEventListener("click", async () => {
        addMarkerBtn.disabled = true;
        addMarkerBtn.textContent = "⏳ جاري التقاط التوقيت...";
        let secs = lastKnownTime;
        if (secs === null || !Number.isFinite(secs)) {
          // Ask the player once and give the listeners a moment to answer.
          askCurrentTime();
          await new Promise((resolve) => setTimeout(resolve, 700));
          secs = lastKnownTime;
        }
        addMarkerBtn.disabled = false;
        addMarkerBtn.textContent = "🚩 ＋ إضافة علامة هنا";
        capturedTime = secs;
        if (secs === null) {
          showToast(
            "تعذّر قراءة توقيت الفيديو. شغّلي الفيديو وأوقفي عند اللحظة المطلوبة ثم اضغطي الزر مرة أخرى.",
            "warning",
          );
          return;
        }
        capturedLabel.textContent = formatDuration(secs);
        titleRow.style.display = "flex";
        titleInput.value = "";
        titleInput.placeholder = `عنوان العلامة (مثال: سؤال 1) — عند ${formatDuration(secs)}`;
        titleInput.focus();
      });

      const commitMarker = () => {
        const title = titleInput.value.trim();
        if (!title) {
          showToast("اكتب عنواناً للعلامة قبل الإضافة.", "warning");
          titleInput.focus();
          return;
        }
        if (capturedTime === null || !Number.isFinite(capturedTime)) {
          showToast(
            "لم يُلتقط توقيت الفيديو بعد. أوقفي الفيديو عند اللحظة المطلوبة ثم اضغطي «إضافة علامة هنا» مرة أخرى.",
            "warning",
          );
          titleRow.style.display = "none";
          return;
        }
        if (videoObj.lengthSeconds && capturedTime > videoObj.lengthSeconds) {
          showToast(
            `التوقيت (${formatDuration(
              capturedTime,
            )}) يتجاوز طول الفيديو (${formatDuration(
              videoObj.lengthSeconds,
            )}).`,
            "danger",
          );
          return;
        }
        markers.push({ title, startTimeSeconds: capturedTime });
        markers.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
        titleRow.style.display = "none";
        renderList();
      };

      confirmBtn.addEventListener("click", commitMarker);
      titleInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitMarker();
        } else if (e.key === "Escape") {
          e.preventDefault();
          titleRow.style.display = "none";
        }
      });
      cancelBtn.addEventListener("click", () => {
        titleRow.style.display = "none";
      });

      // --- 5) Final save (single API call for the whole set) ---
      const saveBar = document.createElement("div");
      saveBar.style.cssText =
        "display:flex; gap:0.6rem; align-items:center; flex-wrap:wrap; margin-top:0.25rem;";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn btn-primary";
      saveBtn.style.cssText =
        "font-size:0.85rem; border-radius:50px; padding:0.45rem 1.1rem;";
      saveBtn.textContent = "💾 حفظ التقسيم";
      saveBar.appendChild(saveBtn);

      const hint = document.createElement("span");
      hint.className = "text-muted";
      hint.style.cssText = "font-size:0.78rem;";
      hint.textContent =
        "تُحفظ كل العلامات دفعة واحدة عند الضغط على الحفظ فقط.";
      saveBar.appendChild(hint);
      wrap.appendChild(saveBar);

      saveBtn.addEventListener("click", async () => {
        if (!markers.length) {
          showToast("أضف علامة واحدة على الأقل قبل الحفظ.", "warning");
          return;
        }
        const times = markers.map((m) => m.startTimeSeconds);
        const dups = [
          ...new Set(times.filter((t, i) => times.indexOf(t) !== i)),
        ];
        if (dups.length) {
          showToast(
            `لا يمكن الحفظ: أكثر من علامة في نفس التوقيت (${dups
              .map((t) => formatDuration(t))
              .join("، ")}). عدّلي التوقيتات ثم احفظي.`,
            "danger",
          );
          return;
        }
        for (let i = 1; i < times.length; i++) {
          if (times[i] < times[i - 1]) {
            showToast(
              "تحذير: توقيتات العلامات غير مرتبة — سأرتّبها تلقائياً عند الحفظ.",
              "warning",
            );
            break;
          }
        }
        if (videoObj.lengthSeconds) {
          const over = markers.find(
            (m) => m.startTimeSeconds > videoObj.lengthSeconds,
          );
          if (over) {
            showToast(
              `توقيت العلامة "${over.title}" (${formatDuration(
                over.startTimeSeconds,
              )}) يتجاوز طول الفيديو (${formatDuration(
                videoObj.lengthSeconds,
              )}).`,
              "danger",
            );
            return;
          }
        }

        saveBtn.disabled = true;
        try {
          const result = await fetchJson(
            `/api/videos/${videoObj.videoId}/chapters`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({ chapters: markers }),
            },
          );

          // The PUT response is authoritative: it returns the freshly-sorted,
          // fully-synced chapter list. Use it as the source of truth even if
          // the follow-up refresh below misbehaves.
          const setChapters = (chapters) => {
            videoObj.chapters = (chapters || []).map((c) => ({
              title: c.title,
              startTimeSeconds: c.startTimeSeconds,
            }));
            markers.length = 0;
            videoObj.chapters.forEach((c) =>
              markers.push({
                title: c.title,
                startTimeSeconds: c.startTimeSeconds,
              }),
            );
            markers.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
            renderList();
          };
          setChapters(result.chapters);

          // Follow-up refresh is best-effort ONLY. It must never surface an
          // error after a genuine save — the running list already shows the
          // authoritative chapters. Any failure here is logged, not toasted.
          try {
            const updated = await fetchJson(
              `/api/lessons/${manageLesson.value}/videos`,
              { headers: authHeaders() },
            );
            const freshVideo = (updated.videos || []).find(
              (x) => x.videoId === videoObj.videoId,
            );
            if (freshVideo) {
              setChapters(freshVideo.chapters);
            }
          } catch (refreshError) {
            console.error(
              "[chapters] تم الحفظ بنجاح لكن فشل تحديث القائمة:",
              refreshError,
            );
          }

          // Success is confirmed only after the save completed WITHOUT leaving
          // any pending work behind. A refresh problem can change the message
          // or log details, but can never produce a false success or an error
          // toast after it.
          showToast("تم حفظ التقسيم بنجاح.", "success");
        } catch (err) {
          console.error("[chapters] فشل حفظ التقسيم:", err);
          showToast(err.message, "danger");
        } finally {
          saveBtn.disabled = false;
        }
      });

      renderList();
      panelEl.appendChild(wrap);
    };
    const renderManageList = () => {
      videosListBox.innerHTML = "";

      if (!loadedVideos.length) {
        videosListBox.innerHTML =
          '<p class="text-muted" style="margin:0;">لا توجد فيديوهات مرفوعة لهذا الدرس بعد.</p>';
        return;
      }

      loadedVideos.forEach((v, idx) => {
        const row = document.createElement("div");
        row.style.cssText =
          "display:flex; flex-direction:column; gap:0.75rem; padding:0.9rem; border:1px solid var(--color-primary-light); border-radius:var(--radius-md); margin-bottom:0.75rem; background: var(--surface-glass);";

        const topRow = document.createElement("div");
        topRow.style.cssText =
          "display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center; width:100%;";

        const info = document.createElement("div");
        info.style.cssText = "flex:1; min-width:200px;";
        info.innerHTML =
          `<div style="font-weight:700;">${idx + 1}. ${v.name || "(بدون اسم)"}</div>` +
          `<div class="text-muted" style="font-size:0.8rem;">` +
          `${v.ready ? `⏱ ${Math.max(1, Math.round(v.lengthSeconds / 60))} دقيقة` : "⏳ قيد المعالجة"}</div>`;

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex; gap:0.5rem; flex-wrap:wrap;";
        actions.innerHTML =
          '<button class="btn btn-secondary js-manage-chapters" style="font-size:0.8rem; background-color:var(--color-primary-ghost); color:var(--color-primary-ink); border-color:var(--color-primary-light);">📖 الفصول</button>' +
          '<button class="btn btn-light js-edit-video" style="font-size:0.8rem;">✏️ تعديل</button>' +
          '<button class="btn btn-light js-delete-video" style="font-size:0.8rem; color:var(--color-danger);">🗑 حذف</button>';

        topRow.append(info, actions);
        row.append(topRow);

        const chaptersPanel = document.createElement("div");
        chaptersPanel.className = "chapters-manage-panel";
        chaptersPanel.style.cssText =
          "display:none; margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed var(--color-border);";
        row.append(chaptersPanel);

        // Click handler for chapters panel
        row
          .querySelector(".js-manage-chapters")
          .addEventListener("click", () => {
            const isHidden = chaptersPanel.style.display === "none";
            document
              .querySelectorAll(".chapters-manage-panel")
              .forEach((panel) => {
                panel.style.display = "none";
                if (panel.__stopTimeTicker) {
                  panel.__stopTimeTicker();
                  panel.__stopTimeTicker = null;
                }
              });

            if (isHidden) {
              chaptersPanel.style.display = "block";
              renderVideoChaptersPanel(v, chaptersPanel);
            } else {
              chaptersPanel.style.display = "none";
            }
          });

        row.querySelector(".js-edit-video").addEventListener("click", () => {
          document.querySelector("#edit-video-id").value = v.videoId;
          document.querySelector("#edit-name").value = v.name || "";
          document.querySelector("#edit-move-lesson").value = "";
          editForm.style.display = "block";
          editForm.scrollIntoView({ behavior: "smooth", block: "center" });
        });

        row
          .querySelector(".js-delete-video")
          .addEventListener("click", async () => {
            const confirmed = await showConfirmModal(
              `حذف الفيديو "${v.name || idx + 1}" نهائياً من Bunny؟ لا يمكن التراجع.`,
              { isDestructive: true, confirmText: "حذف", cancelText: "إلغاء" },
            );
            if (!confirmed) return;
            try {
              await fetchJson(`/api/videos/${v.videoId}`, {
                method: "DELETE",
                headers: authHeaders(),
              });
              showToast("تم حذف الفيديو بنجاح.", "success");
              loadVideosList();
            } catch (error) {
              showToast(error.message, "danger");
            }
          });

        videosListBox.appendChild(row);
      });
    };

    const loadVideosList = async () => {
      const lessonId = manageLesson.value;
      if (!lessonId) return;
      // Show a skeleton immediately in the already-visible list box while
      // the database call is in flight (never a blank/frozen area).
      videosListBox.innerHTML = skeletonRows(3);
      try {
        const data = await fetchJson(`/api/lessons/${lessonId}/videos`, {
          headers: authHeaders(),
        });
        loadedVideos = data.videos || [];
        renderManageList();
      } catch (error) {
        loadedVideos = [];
        videosListBox.innerHTML = skeletonError(
          "تعذر تحميل الفيديوهات، حاولي مرة أخرى.",
          "إعادة المحاولة",
        );
        videosListBox
          .querySelector(".skeleton-retry-btn")
          ?.addEventListener("click", loadVideosList);
        showToast(error.message, "danger");
      }
    };

    document
      .querySelector("#btn-load-videos")
      .addEventListener("click", loadVideosList);

    document.querySelector("#btn-cancel-edit").addEventListener("click", () => {
      editForm.style.display = "none";
    });

    document
      .querySelector("#btn-save-edit")
      .addEventListener("click", async () => {
        const videoId = document.querySelector("#edit-video-id").value;
        const body = {
          name: document.querySelector("#edit-name").value,
        };
        const moveTo = document.querySelector("#edit-move-lesson").value;
        if (moveTo) body.lessonId = moveTo;

        try {
          await fetchJson(`/api/videos/${videoId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders(),
            },
            body: JSON.stringify(body),
          });
          showToast("تم حفظ التعديلات بنجاح.", "success");
          editForm.style.display = "none";
          loadVideosList();
        } catch (error) {
          showToast(error.message, "danger");
        }
      });
  }

  // --- Teacher dashboard: manage lesson PDF materials (rename / delete) ---
  // Mirrors the video management block above: same selects pattern, same
  // inline edit form, same in-app confirm modal before deleting.
  const materialsManageChapter = document.querySelector(
    "#materials-manage-chapter",
  );
  const materialsManageLesson = document.querySelector(
    "#materials-manage-lesson",
  );

  if (materialsManageChapter && materialsManageLesson && window.CURRICULUM) {
    // Auth uses the shared JWT helper — the backend enforces the teacher role.

    /** Fills the lesson dropdown for the chosen chapter. */
    const fillMaterialsManageLessons = (chapterIdx) => {
      const chapter = window.CURRICULUM.biology[chapterIdx];
      materialsManageLesson.innerHTML = "";
      chapter.lessons.forEach((lesson) => {
        const opt = document.createElement("option");
        opt.value = lesson.id;
        opt.textContent = `${lesson.name} (${lesson.id})`;
        materialsManageLesson.appendChild(opt);
      });
    };

    window.CURRICULUM.biology.forEach((chapter, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = chapter.name;
      materialsManageChapter.appendChild(opt);
    });
    materialsManageChapter.addEventListener("change", () =>
      fillMaterialsManageLessons(Number(materialsManageChapter.value)),
    );
    fillMaterialsManageLessons(0);

    const materialEditForm = document.querySelector("#material-edit-form");
    const materialsListBox = document.querySelector("#manage-materials-list");
    let loadedMaterials = [];

    /** Formats a byte count for the management list ("812 KB" / "1.4 MB"). */
    const formatMaterialSize = (sizeBytes) => {
      if (!sizeBytes) return "";
      if (sizeBytes < 1024 * 1024)
        return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
      return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    /** Formats an ISO date as a short readable date for the list rows. */
    const formatMaterialDate = (isoDate) => {
      if (!isoDate) return "";
      try {
        return new Date(isoDate).toLocaleDateString("ar-EG");
      } catch (error) {
        return "";
      }
    };

    const renderMaterialsManageList = () => {
      materialsListBox.innerHTML = "";

      if (!loadedMaterials.length) {
        materialsListBox.innerHTML =
          '<p class="text-muted" style="margin:0;">لا توجد ملفات PDF مرفوعة لهذا الدرس بعد.</p>';
        return;
      }

      loadedMaterials.forEach((material, idx) => {
        const row = document.createElement("div");
        row.style.cssText =
          "display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center; padding:0.9rem; border:1px solid var(--color-primary-light); border-radius:var(--radius-md); margin-bottom:0.75rem;";

        const info = document.createElement("div");
        info.style.cssText = "flex:1; min-width:200px;";
        const metaParts = [
          formatMaterialDate(material.createdAt),
          formatMaterialSize(material.sizeBytes),
        ]
          .filter(Boolean)
          .join(" • ");
        info.innerHTML =
          `<div style="font-weight:700;">${idx + 1}. ${material.title || "(بدون اسم)"}</div>` +
          `<div class="text-muted" style="font-size:0.8rem;">📄 PDF${metaParts ? ` • ${metaParts}` : ""}</div>`;

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex; gap:0.5rem;";
        actions.innerHTML =
          '<button class="btn btn-light js-edit-material" style="font-size:0.8rem;">✏️ تعديل</button>' +
          '<button class="btn btn-light js-delete-material" style="font-size:0.8rem; color:var(--color-danger);">🗑 حذف</button>';

        row.append(info, actions);

        row.querySelector(".js-edit-material").addEventListener("click", () => {
          document.querySelector("#edit-material-id").value = material.id;
          document.querySelector("#edit-material-title").value =
            material.title || "";
          materialEditForm.style.display = "block";
          materialEditForm.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });

        row
          .querySelector(".js-delete-material")
          .addEventListener("click", async () => {
            const confirmed = await showConfirmModal(
              `حذف هذه المادة "${material.title || idx + 1}" نهائياً؟ لا يمكن التراجع.`,
              { isDestructive: true, confirmText: "حذف", cancelText: "إلغاء" },
            );
            if (!confirmed) return;
            try {
              await fetchJson(
                `/api/materials/${encodeURIComponent(material.id)}`,
                {
                  method: "DELETE",
                  headers: authHeaders(),
                },
              );
              showToast("تم حذف المادة بنجاح.", "success");
              loadMaterialsManageList();
            } catch (error) {
              showToast(error.message, "danger");
            }
          });

        materialsListBox.appendChild(row);
      });
    };

    const loadMaterialsManageList = async () => {
      const lessonId = materialsManageLesson.value;
      if (!lessonId) return;
      materialsListBox.innerHTML = skeletonRows(3);
      try {
        const data = await fetchJson(
          `/api/lessons/${lessonId}/materials/manage`,
          { headers: authHeaders() },
        );
        loadedMaterials = data.materials || [];
        renderMaterialsManageList();
      } catch (error) {
        loadedMaterials = [];
        materialsListBox.innerHTML = skeletonError(
          "تعذر تحميل ملفات PDF، حاولي مرة أخرى.",
          "إعادة المحاولة",
        );
        materialsListBox
          .querySelector(".skeleton-retry-btn")
          ?.addEventListener("click", loadMaterialsManageList);
        showToast(error.message, "danger");
      }
    };

    document
      .querySelector("#btn-load-materials")
      .addEventListener("click", loadMaterialsManageList);

    document
      .querySelector("#btn-cancel-material-edit")
      .addEventListener("click", () => {
        materialEditForm.style.display = "none";
      });

    document
      .querySelector("#btn-save-material-edit")
      .addEventListener("click", async () => {
        const materialId = document.querySelector("#edit-material-id").value;
        const newTitle = document.querySelector("#edit-material-title").value;

        if (!newTitle.trim()) {
          showToast("اكتبي اسم المادة أولاً.", "warning");
          return;
        }

        try {
          await fetchJson(`/api/materials/${encodeURIComponent(materialId)}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders(),
            },
            body: JSON.stringify({ title: newTitle }),
          });
          showToast("تم حفظ التعديلات بنجاح.", "success");
          materialEditForm.style.display = "none";
          loadMaterialsManageList();
        } catch (error) {
          showToast(error.message, "danger");
        }
      });
  }
});
