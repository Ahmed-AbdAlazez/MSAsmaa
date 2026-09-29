/**
 * Format a total-seconds value as a compact clock string. Hours are
 * included only when non-zero, so 75 -> "1:15" and 3930 -> "1:05:30".
 */
export const formatDuration = (totalSeconds) => {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  }
  return `${minutes}:${ss}`;
};

/**
 * Check if a JWT token is expired or invalid.
 */
export const isTokenExpired = (token) => {
  if (!token) return true;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const decoded = JSON.parse(jsonPayload);
    if (decoded && decoded.exp) {
      return Date.now() / 1000 >= decoded.exp;
    }
    return false;
  } catch (_) {
    return true;
  }
};

/**
 * Clear stored auth credentials from localStorage.
 */
export const clearAuthSession = () => {
  localStorage.removeItem("userRole");
  localStorage.removeItem("username");
  localStorage.removeItem("userId");
  localStorage.removeItem("token");
};

/**
 * Handle automatic logout when session expires or 401 response is received.
 */
export const handleAutoLogout = (msg = "انتهت صلاحية الجلسة. تم تسجيل الخروج تلقائياً.") => {
  clearAuthSession();
  const currentPath = window.location.pathname;
  if (!currentPath.includes("login")) {
    if (typeof window.showToast === "function") {
      window.showToast(msg, "error");
    } else {
      alert(msg);
    }
    setTimeout(() => {
      window.location.href = "/login";
    }, 500);
  }
};