/**
 * loginPage.js — Dedicated authentication page (login.html).
 *
 * Replaces the old welcome/login modal that used to live in src/main.js:
 *   - Same endpoints (POST ${API_BASE}/auth/login and /auth/signup)
 *   - Same request payloads, validation rules and error surfacing
 *   - Same localStorage session keys (userRole / username / userId / token)
 *   - Role ALWAYS comes from the backend response, never from the UI select
 * Only the presentation changed: a standalone page with a sign-in /
 * sign-up tab control instead of a dialog.
 */

const API_BASE = import.meta.env.VITE_API_URL;

const normalizeCode = (value = '') => value.trim().toUpperCase();
const isStrongPassword = (password) => /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);

// Mirrors fetchJson() from src/main.js so both entry points surface
// backend errors identically.
async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    throw new Error(
      `لا يمكن الوصول إلى السيرفر (${url}). تأكد من تشغيل السيرفر (node server.js) ثم أعد المحاولة.`
    );
  }

  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (parseError) {
    // Non-JSON response: usually HTML from a static host or an error page.
    const preview = raw.replace(/<[^>]*>/g, ' ').trim().slice(0, 80);
    throw new Error(
      `السيرفر في ${url} أعاد رداً غير JSON (كود ${response.status})${preview ? `: ${preview}` : ''}. حاول مرة أخرى بعد دقائق، أو تواصل مع مسؤولة المنصة إن استمرت المشكلة.`
    );
  }

  if (!response.ok) {
    // The v1 backend sends { message } (errorMiddleware); older routes send
    // { error }. Show whichever the backend actually returned.
    throw new Error(data.message || data.error || `خطأ من السيرفر (${response.status}).`);
  }
  return data;
}

function showToast(message, type = 'success') {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  }
}

/**
 * Shared finish-login routine: stores the JWT + non-sensitive session
 * info, shows the welcome toast and redirects to the dashboard matching
 * the role returned by the BACKEND.
 */
function completeLogin(role, displayName, userId, token) {
  localStorage.setItem('userRole', String(role || 'student').toLowerCase());
  localStorage.setItem('username', displayName != null ? String(displayName) : '');
  localStorage.setItem('userId', userId != null ? String(userId) : '');
  if (token) localStorage.setItem('token', token);

  showToast(`مرحباً بك يا ${displayName}! تم تسجيل الدخول بنجاح. 🎉`, 'success');

  setTimeout(() => {
    if (String(role).toLowerCase() === 'teacher') {
      window.location.href = 'dashboard-teacher.html';
    } else {
      window.location.href = 'courses.html';
    }
  }, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('auth-form');
  const nameGroup = document.getElementById('auth-name-group');
  const nameInput = document.getElementById('login-username');
  const emailGroup = document.getElementById('auth-email-group');
  const emailInput = document.getElementById('login-email');
  const codeInput = document.getElementById('login-code');
  const passwordInput = document.getElementById('login-password');
  const confirmPasswordGroup = document.getElementById('confirm-password-group');
  const confirmPasswordInput = document.getElementById('login-confirm-password');
  const passwordRequirements = document.getElementById('password-requirements');
  const submitButton = document.getElementById('auth-submit-btn');
  const titleEl = document.getElementById('auth-title');
  const descEl = document.getElementById('auth-desc');
  const welcomeTitleEl = document.getElementById('auth-welcome-title');
  const welcomeSubEl = document.getElementById('auth-welcome-sub');
  const modeButtons = Array.from(document.querySelectorAll('.auth-tab'));

  const WELCOME_COPY = {
    signin: {
      title: 'أهلاً بيك تاني! 👋',
      sub: 'سجّل الدخول وكمّل رحلتك في عالم الأحياء.',
    },
    signup: {
      title: 'أهلاً بيك معانا! 🌱',
      sub: 'أنشئ حسابك وابدأ رحلتك نحو التفوق.',
    },
  };

  if (!form || !codeInput || !passwordInput || !submitButton) return;

  let authMode = 'signin';

  const setAuthMode = (mode) => {
    authMode = mode === 'signup' ? 'signup' : 'signin';
    const isSignUp = authMode === 'signup';

    titleEl.textContent = isSignUp ? 'إنشاء حساب' : 'تسجيل الدخول';
    descEl.textContent = isSignUp
      ? 'أنشئ حساباً باختيار كود خاص بك مع كلمة مرور آمنة.'
      : 'استخدم كود الدخول المخصص من المعلمة مع كلمة المرور للوصول إلى حسابك.';
    submitButton.innerHTML = isSignUp
      ? '<span aria-hidden="true">✚</span> إنشاء حساب'
      : '<span aria-hidden="true">↪</span> تسجيل الدخول';

    if (nameGroup) nameGroup.hidden = !isSignUp;
    if (nameInput) nameInput.required = isSignUp;
    if (emailGroup) emailGroup.hidden = !isSignUp;
    if (emailInput) emailInput.required = isSignUp;
    if (confirmPasswordGroup) confirmPasswordGroup.hidden = !isSignUp;
    if (confirmPasswordInput) confirmPasswordInput.required = isSignUp;
    if (passwordRequirements) passwordRequirements.hidden = !isSignUp;
    passwordInput.autocomplete = isSignUp ? 'new-password' : 'current-password';

    modeButtons.forEach((button) => {
      const active = button.dataset.authMode === authMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });

    if (welcomeTitleEl && welcomeSubEl) {
      welcomeTitleEl.textContent = WELCOME_COPY[authMode].title;
      welcomeSubEl.textContent = WELCOME_COPY[authMode].sub;
    }

    // Keep the URL shareable: login.html?mode=signup opens the signup tab.
    try {
      const url = new URL(window.location.href);
      if (isSignUp) url.searchParams.set('mode', 'signup');
      else url.searchParams.delete('mode');
      history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ''));
    } catch (_) { /* non-browser env — ignore */ }
  };

  modeButtons.forEach((button) =>
    button.addEventListener('click', () => setAuthMode(button.dataset.authMode))
  );

  document.querySelector('.password-toggle')?.addEventListener('click', (event) => {
    const willShowPassword = passwordInput.type === 'password';
    passwordInput.type = willShowPassword ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-label', willShowPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    event.currentTarget.setAttribute('title', willShowPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    event.currentTarget.textContent = willShowPassword ? '◉' : '◌';
  });

  // --- Sign in: POST ${API_BASE}/auth/login -------------------------------
  // Body fields match the backend authController exactly:
  //   { studentCode, password }
  // Response: { status, token, data: { user: { id, name, role, ... } } }
  // The role ALWAYS comes from the backend — never from the UI select.
  //
  // --- Sign up: POST ${API_BASE}/auth/signup ------------------------------
  // Body: { studentCode, name, password } -> creates a PENDING request
  // that the teacher approves. No JWT is issued at signup; the user must
  // log in AFTER approval.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = (nameInput?.value || '').trim();
    const email = (emailInput?.value || '').trim().toLowerCase();
    const code = normalizeCode(codeInput.value);
    const password = passwordInput.value;

    if (!code) {
      showToast('يرجى إدخال كود الدخول.', 'warning');
      codeInput.focus();
      return;
    }

    if (!isStrongPassword(password)) {
      showToast('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم واحد على الأقل.', 'warning');
      passwordInput.focus();
      return;
    }

    if (authMode === 'signin') {
      try {
        const data = await fetchJson(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentCode: code, password }),
        });

        const user = data && data.data && data.data.user;
        if (!data || !data.token || !user) {
          throw new Error('رد غير متوقع من السيرفر أثناء تسجيل الدخول.');
        }

        completeLogin(user.role, user.name, user.id, data.token);
        return;
      } catch (error) {
        // Real backend error (invalid credentials / pending / rejected).
        // No fallback to any local account is allowed.
        showToast(error.message, 'danger');
        passwordInput.focus();
        return;
      }
    }

    if (authMode === 'signup') {
      if (!usernameInput) {
        showToast('يرجى إدخال الاسم لإنشاء الحساب.', 'warning');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('يرجى إدخال Gmail صحيح.', 'warning');
        emailInput?.focus();
        return;
      }
      if (password !== confirmPasswordInput?.value) {
        showToast('كلمتا المرور غير متطابقتين.', 'warning');
        confirmPasswordInput?.focus();
        return;
      }

      try {
        const data = await fetchJson(`${API_BASE}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentCode: code,
            name: usernameInput,
            email,
            password,
            confirmPassword: confirmPasswordInput.value,
          }),
        });

        showToast(
          (data && data.message) ||
            'تم إرسال طلب التسجيل بنجاح. بانتظار موافقة المعلمة ثم سجّل الدخول.',
          'success'
        );
        form.reset();
        setAuthMode('signin');
      } catch (error) {
        showToast(error.message, 'danger');
      }
    }
  });

  // Deep-link support: login.html?mode=signup opens the signup tab directly.
  const requestedMode = new URLSearchParams(window.location.search).get('mode');
  setAuthMode(requestedMode === 'signup' ? 'signup' : 'signin');
});
