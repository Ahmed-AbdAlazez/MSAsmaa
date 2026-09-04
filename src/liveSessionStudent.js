/**
 * liveSessionStudent.js
 * ---------------------------------------------------------------------------
 * Client-side script for validating live stream join token and rendering the
 * embedded meeting player safely inside live-session.html.
 */

const API_BASE = "/api";

function getToken() {
  return localStorage.getItem("token") || "";
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data.error || `خطأ في الاتصال بالسيرفر (${res.status})`;
    const error = new Error(errorMsg);
    error.status = res.status;
    throw error;
  }
  return data;
}

document.addEventListener("DOMContentLoaded", async () => {
  const loadingEl = document.getElementById("live-loading-state");
  const streamEl = document.getElementById("live-stream-view");
  const errorEl = document.getElementById("live-error-view");
  const errorMessageEl = document.getElementById("live-error-message");
  const sessionTitleEl = document.getElementById("live-session-title");
  const providerBadgeEl = document.getElementById("live-provider-badge");
  const iframeEl = document.getElementById("live-iframe");

  const urlParams = new URLSearchParams(window.location.search);
  let joinToken = urlParams.get("token");
  const sessionId = urlParams.get("sessionId");

  function showError(msg) {
    if (loadingEl) loadingEl.style.display = "none";
    if (streamEl) streamEl.style.display = "none";
    if (errorEl) errorEl.style.display = "block";
    if (errorMessageEl) errorMessageEl.textContent = msg;
  }

  // If user navigated directly via notification link with sessionId, acquire join token first
  if (!joinToken && sessionId) {
    try {
      const tokenData = await fetchJson(`${API_BASE}/live/join-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ sessionId }),
      });
      joinToken = tokenData.token;
      // Replace URL without reload to clean address bar
      window.history.replaceState({}, document.title, `/live-session.html?token=${joinToken}`);
    } catch (err) {
      return showError(err.message || "تعذر الحصول على رابط الدخول للبث المباشر.");
    }
  }

  if (!joinToken) {
    return showError("رابط الدخول غير مكتمل. يرجى الانضمام من خلال زر البث المباشر في المنصة.");
  }

  try {
    const data = await fetchJson(`${API_BASE}/live/embed-info?token=${encodeURIComponent(joinToken)}`, {
      headers: authHeaders(),
    });

    if (sessionTitleEl) sessionTitleEl.textContent = data.title || "بث مباشر تعليمي";

    if (providerBadgeEl) {
      if (data.provider === "google_meet") {
        providerBadgeEl.textContent = "Google Meet 🟢";
        providerBadgeEl.className = "provider-badge provider-meet";
      } else if (data.provider === "jitsi") {
        providerBadgeEl.textContent = "Jitsi Meet 🟣 (مدمج 100%)";
        providerBadgeEl.className = "provider-badge provider-meet";
        providerBadgeEl.style.background = "rgba(147, 51, 234, 0.12)";
        providerBadgeEl.style.color = "#9333ea";
      } else {
        providerBadgeEl.textContent = "Zoom 🔵";
        providerBadgeEl.className = "provider-badge provider-zoom";
      }
    }

    const meetBoxEl = document.getElementById("live-meet-box");
    const meetJoinBtnEl = document.getElementById("live-meet-join-btn");

    if (data.provider === "google_meet" || data.provider === "jitsi") {
      if (iframeEl) iframeEl.style.display = "none";
      if (meetBoxEl) {
        meetBoxEl.style.display = "flex";
        if (meetJoinBtnEl) {
          meetJoinBtnEl.href = data.embedUrl;
          if (data.provider === "jitsi") {
            const titleHeader = meetBoxEl.querySelector("h2");
            if (titleHeader) titleHeader.textContent = "غرفة البث المباشر جاهزة (Jitsi Meet)";
          }
        }
      }
    } else {
      if (meetBoxEl) meetBoxEl.style.display = "none";
      if (iframeEl) {
        iframeEl.style.display = "block";
        if (data.allowCamera) {
          iframeEl.allow = "camera; microphone; display-capture; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
        } else {
          iframeEl.allow = "microphone; display-capture; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
        }
        iframeEl.src = data.embedUrl;
      }
    }

    if (loadingEl) loadingEl.style.display = "none";
    if (streamEl) streamEl.style.display = "block";
  } catch (err) {
    showError(err.message || "تعذر التحقق من رابط الدخول للبث المباشر.");
  }
});
