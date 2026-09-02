/**
 * liveSession.js
 * ===========================================================================
 * Isolated Daily.co live-streaming component for the vanilla multi-page app.
 *
 * Responsibilities:
 *   - Poll `GET /api/live/status` to detect an active session.
 *   - Render a prominent "🔴 بث مباشر الآن" indicator (students) or a
 *     "بدء بث مباشر" button (teacher), embedded INSIDE the page.
 *   - Open Daily.co's Prebuilt video UI in an embedded <iframe> drawn inside
 *     the page (never a redirect / new tab).
 *   - Apply the site's brand palette to the Prebuilt call (light + dark).
 *
 * WHY DAILY PREBUILT (iframe) instead of the React SDK:
 *   This repo is a plain HTML/CSS/JS multi-page app (no React). Daily's
 *   Prebuilt iframe + daily-js createFrame() gives us the full call UI
 *   (mute/unmute mic, camera toggle, end session, participant management)
 *   embedded in-place with zero React, zero build changes, and full theme
 *   + mobile support. It is the conflict-safe choice for this codebase.
 *
 * The component is exported as a factory taking { API_BASE, authHeaders,
 * fetchJson, showToast } — the exact same dependency-injection pattern as
 * initStudentsPage / initStudentMistakesPage in this project.
 * ===========================================================================
 */

// Daily loads its Prebuilt iframe script from this CDN on demand.
const DAILY_JS_CDN = "https://unpkg.com/@daily-co/daily-js/dist/daily.js";

// Brand palette (mirrors css/style.css CSS variables).
const DAILY_THEME = {
  light: {
    colors: {
      accent: "#0F4C3A",        // --color-primary
      accentText: "#FFFFFF",
      background: "#FFFFFF",     // --color-surface
      backgroundAccent: "#F8FAFC", // --color-bg
      baseText: "#0F172A",
      border: "#E2E8F0",
      mainAreaBg: "#0F172A",
      mainAreaBgAccent: "#133A2E",
      mainAreaText: "#FFFFFF",
      supportiveText: "#64748B",
    },
  },
  dark: {
    colors: {
      accent: "#10B981",        // emerald accent
      accentText: "#0C1420",
      background: "#14212F",    // --color-surface (dark)
      backgroundAccent: "#0C1420", // --color-bg (dark)
      baseText: "#E2E8F0",
      border: "#243447",
      mainAreaBg: "#0C1420",
      mainAreaBgAccent: "#1A2938",
      mainAreaText: "#F1F5F9",
      supportiveText: "#94A3B8",
    },
  },
};

/** Load daily-js once. Resolves to window.Daily$ or window.Daily. */
let dailyJsPromise = null;
function loadDailyJs() {
  if (window.Daily) return Promise.resolve(window.Daily);
  if (dailyJsPromise) return dailyJsPromise;
  dailyJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = DAILY_JS_CDN;
    script.async = true;
    script.onload = () => {
      const Daily = window.Daily || window.Daily$;
      if (Daily) resolve(Daily);
      else reject(new Error("daily-js loaded but Daily object not found."));
    };
    script.onerror = () =>
      reject(new Error("تعذر تحميل مكتبة البث المباشر (daily-js). تحققي من اتصالك."));
    document.head.appendChild(script);
  });
  return dailyJsPromise;
}

/** Current page theme (mirrors data-theme attribute on <html>). */
function currentTheme() {
  return (
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light"
  );
}

/** Kept so the module still shares the class-hiding used elsewhere. */
function liveFrameId() {
  return "msasmaa-live-frame";
}

/**
 * Opens the Daily Prebuilt call embedded inside the page.
 *
 * @param {object} deps   { fetchJson, authHeaders, showToast }
 * @param {{url:string, token:string, isOwner:boolean, stub?:boolean}} room
 */
async function openEmbeddedCall(deps, room) {
  const { showToast } = deps;

  // Close/clean any previously opened frame so only one call shows at a time.
  closeEmbeddedCall();

  try {
    const Daily = await loadDailyJs();

    const host = document.createElement("div");
    host.id = "msasmaa-live-stage";
    host.className = "live-stage";

    const stageHeader = document.createElement("div");
    stageHeader.className = "live-stage-header";
    stageHeader.innerHTML =
      '<span class="live-stage-badge">🔴 بث مباشر</span>' +
      '<button type="button" class="live-stage-close" aria-label="إنهاء البث">✕ إنهاء</button>';
    host.appendChild(stageHeader);

    const frameHost = document.createElement("div");
    frameHost.className = "live-stage-frame";
    host.appendChild(frameHost);

    // Replace any old stage, then append (before the footer, after content).
    const previous = document.getElementById(host.id);
    if (previous) previous.remove();
    const anchor = document.querySelector("main") || document.body;
    anchor.appendChild(host);

    const frame = Daily.createFrame({
      parentEl: frameHost,
      url: room.url,
      token: room.token,
      showLeaveButton: false, // we provide our own end/close control
      iframeStyle: { width: "100%", height: "100%", border: "0" },
      theme: DAILY_THEME,
      lang: "ar",
    });

    // Wire the site's "إنهاء" button. For the owner this also ends the
    // session server-side (which kicks everyone and deletes the room); for a
    // student it just leaves their own camera/mic and hides the stage.
    const closeBtn = host.querySelector(".live-stage-close");
    closeBtn.addEventListener("click", async () => {
      try {
        if (room.isOwner) {
          await deps.fetchJson("/api/live/end", {
            method: "POST",
            headers: { ...deps.authHeaders(), "Content-Type": "application/json" },
          });
        }
      } catch (_) {
        /* best-effort; we still leave the call */
      }
      try { frame.destroy(); } catch (_) {}
      host.remove();
      refreshLiveUi(deps); // reflect the now-idle state everywhere
    });

    // Also destroy the frame if the user navigates away via a link while the
    // page stays mounted (guard against dangling camera/mic).
    window.addEventListener(
      "beforeunload",
      () => {
        try { frame.destroy(); } catch (_) {}
      },
      { once: true },
    );

    // Apply the theme again in case the user toggled dark mode after opening.
    try { frame.setTheme(DAILY_THEME[currentTheme()]); } catch (_) {}

    return frame;
  } catch (error) {
    console.error("[liveSession] openEmbeddedCall failed:", error);
    showToast(
      error?.message || "تعذر فتح البث المباشر. يرجى المحاولة لاحقاً.",
      "danger",
    );
    closeEmbeddedCall();
    return null;
  }
}

/** Removes the embedded live stage (leaves the call if open). */
function closeEmbeddedCall() {
  const stage = document.getElementById("msasmaa-live-stage");
  if (stage) stage.remove();
}

/**
 * Returns the element we inject the live UI into. We draw a slim strip right
 * under the navbar so it is visible on every page (exams hub, lesson pages,
 * homepage) — matching the "visible live indicator" requirement.
 */
function ensureLiveBar() {
  let bar = document.getElementById("msasmaa-livebar");
  if (bar) return bar;
  bar = document.createElement("div");
  bar.id = "msasmaa-livebar";
  bar.className = "livebar";
  const navbar = document.querySelector(".navbar");
  if (navbar && navbar.nextSibling) {
    navbar.parentNode.insertBefore(bar, navbar.nextSibling);
  } else {
    (document.querySelector("main") || document.body).prepend(bar);
  }
  return bar;
}

/**
 * Renders the live indicator / start button based on the current status.
 *
 * @param {object} deps
 * @param {boolean} live   whether a session is currently active
 * @param {object|null} session  the live session info from the server
 */
function renderLiveBar(deps, live, session) {
  const bar = ensureLiveBar();
  const role = String(localStorage.getItem("userRole") || "").toLowerCase();
  const isTeacher = role === "teacher";

  // No active session -> for a teacher show a "بدء بث" affordance; for a
  // student show nothing (empty bar) so the page stays clean.
  if (!live) {
    bar.innerHTML = isTeacher
      ? '<div class="livebar-inner"><span class="livebar-empty">البث المباشر</span>' +
        '<button type="button" class="btn btn-primary btn-sm js-start-live">📡 بدء بث مباشر</button></div>'
      : "";
    bindStartButtons(deps);
    return;
  }

  // Active session.
  const title = (session && session.title) || "بث مباشر — شرح الأحياء";
  bar.innerHTML =
    '<div class="livebar-inner">' +
    '<a href="#live" class="livebar-cta js-live-cta">' +
    '<span class="livebar-dot" aria-hidden="true"></span>' +
    '<strong>🔴 بث مباشر الآن</strong>' +
    '<span class="livebar-title">' + escapeHTML(title) + "</span>" +
    (isTeacher
      ? '<span class="livebar-join">فتح غرفة البث</span>'
      : '<span class="livebar-join">انضمي الآن</span>') +
    "</a>" +
    "</div>";

  // If the teacher already opened the stage, keep the start button around so
  // she can reopen it after closing.
  bindStartButtons(deps);
  bindJoinButton(deps, session);
}

/** Binds the teacher's "بدء بث" button (present when idle). */
function bindStartButtons(deps) {
  const btn = document.querySelector(".js-start-live");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", async () => {
    try {
      btn.disabled = true;
      const data = await deps.fetchJson("/api/live/start", {
        method: "POST",
        headers: { ...deps.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "بث مباشر — شرح الأحياء" }),
      });
      deps.showToast(
        data.stub
          ? "وضع تجريبي: أضفي DAILY_API_KEY لتفعيل بث حقيقي."
          : "بدأ البث المباشر ✅ أُرسل إشعار للطالبات.",
        data.stub ? "warning" : "success",
      );
      // Open the embedded call for the teacher (she is the owner).
      await openEmbeddedCall(deps, {
        url: data.room.url,
        token: data.token,
        isOwner: data.isOwner,
        stub: data.stub,
      });
      refreshLiveUi(deps); // immediately show the "live" state in the bar
    } catch (error) {
      deps.showToast(error?.message || "فشل بدء البث.", "danger");
    } finally {
      btn.disabled = false;
    }
  });
}

/** Binds the student/teacher "join" CTA when a session is live. */
function bindJoinButton(deps, session) {
  const cta = document.querySelector(".js-live-cta");
  if (!cta || cta.dataset.bound) return;
  cta.dataset.bound = "1";
  cta.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      const data = await deps.fetchJson("/api/live/join", {
        method: "POST",
        headers: { ...deps.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await openEmbeddedCall(deps, {
        url: data.room.url,
        token: data.token,
        isOwner: data.isOwner,
        stub: data.stub,
      });
    } catch (error) {
      deps.showToast(error?.message || "فشل الانضمام إلى البث.", "danger");
    }
  });
}

/**
 * Refreshes the live indicator by polling the server. Called on load and
 * periodically so a session that starts/ends while the student is on the page
 * is picked up automatically (best-effort; not a long-poll).
 */
let pollTimer = null;
async function refreshLiveUi(deps) {
  // Only logged-in users have a meaningful live state.
  if (!localStorage.getItem("token")) {
    const bar = document.getElementById("msasmaa-livebar");
    if (bar) bar.innerHTML = "";
    return;
  }

  let live = false;
  let session = null;
  try {
    const data = await deps.fetchJson("/api/live/status", {
      headers: deps.authHeaders(),
    });
    live = Boolean(data.live);
    session = data.session || null;
  } catch (error) {
    console.warn("[liveSession] status poll failed:", error?.message);
  }

  renderLiveBar(deps, live, session);
}

/** HTML-escape helper (mirrors main.js). */
function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Entry point — wire everything for a page.
 *
 * @param {object} deps { API_BASE, authHeaders, fetchJson, showToast }
 */
export function initLiveStreaming(deps) {
  // Re-render whenever the theme changes so the Prebuilt call (if open) and
  // our bar match the current light/dark mode.
  const applyThemeToOpenCall = () => {
    if (window.Daily && typeof window.Daily.of === "function") {
      try {
        const calls = window.Daily.all || [];
        calls.forEach((call) => {
          if (call && typeof call.setTheme === "function") {
            call.setTheme(DAILY_THEME[currentTheme()]);
          }
        });
      } catch (_) {}
    }
  };
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.addEventListener("click", () =>
      setTimeout(applyThemeToOpenCall, 60),
    );
  });

  // Initial render + periodic poll.
  refreshLiveUi(deps);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => refreshLiveUi(deps), 15000);
}
