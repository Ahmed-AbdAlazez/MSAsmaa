/* ==========================================================================
   profile-menu.js — circular avatar + account dropdown (isolated component)
   --------------------------------------------------------------------------
   Vanilla JS on purpose: this site is a multi-page app with no bundler, so a
   JSX/React component would never run. This file keeps the same isolation
   benefits and is structured so a future photo-upload feature slots in:

     - render(user)  -> builds avatar + dropdown from a user object
     - getUser()     -> single source of truth for "who is logged in"
     - swap the <button class="profile-avatar"> markup for an <img> and you
       have photo support without touching anything else.

   Integration contract (deliberately tiny):
     - looks for `.nav-auth-container` (falls back to `.nav-actions`)
     - re-syncs via MutationObserver when main.js re-renders auth controls
     - reads/writes only localStorage keys userRole / username / userId
   ========================================================================== */

(function () {
  'use strict';

  const ROLE_LABELS = { student: 'طالب', teacher: 'معلم' };
  const DASHBOARDS = {
    student: 'dashboard-student.html',
    teacher: 'dashboard-teacher.html',
  };
  const AVATAR_PALETTE = [
    'linear-gradient(135deg, #0F4C3A, #14B8A6)',
    'linear-gradient(135deg, #166A51, #10B981)',
    'linear-gradient(135deg, #0F766E, #34D399)',
  ];

  function getUser() {
    try {
      const role = localStorage.getItem('userRole');
      if (!role) return null;
      return {
        role,
        name: localStorage.getItem('username') || '',
        id: localStorage.getItem('userId') || '',
      };
    } catch (_) {
      return null;
    }
  }

  function pickAvatarBackground(seedText) {
    let hash = 0;
    for (const ch of seedText || '') hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  }

  /* Self-contained mini toast so the component does not depend on main.js */
  function toast(message) {
    const el = document.createElement('div');
    el.className = 'profile-menu-toast';
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 2200);
  }

  async function handleLogout() {
    const confirmed = window.showConfirmModal
      ? await window.showConfirmModal(
          'هل تريد بالتأكيد تسجيل الخروج من الحساب؟',
          { confirmText: 'تسجيل الخروج', cancelText: 'إلغاء' },
        )
      : true;
    if (!confirmed) return;
    ['userRole', 'username', 'userId', 'token'].forEach((key) => {
      try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
    });
    window.location.href = 'index.html';
  }

  function buildMenu(user) {
    const root = document.createElement('div');
    root.className = 'profile-menu';
    root.id = 'profile-menu';

    const initial = (user.name.trim()[0] || (user.role === 'teacher' ? 'أ' : 'ط')).toUpperCase();
    const roleLabel = ROLE_LABELS[user.role] || user.role;

    root.innerHTML = [
      '<button class="profile-avatar" type="button" aria-haspopup="menu" aria-expanded="false"',
      ` title="${user.name || roleLabel}" style="background:${pickAvatarBackground(user.name || user.id)}">`,
      `${initial}</button>`,
      '<div class="profile-dropdown" role="menu" hidden>',
      `<div class="profile-dropdown-header"><strong>${user.name || 'مستخدم'}</strong><small>${roleLabel}</small></div>`,
      '<button class="profile-menu-item" type="button" data-action="profile" role="menuitem">👤 الملف الشخصي</button>',
      `<a class="profile-menu-item" href="${DASHBOARDS[user.role] || '#'}" role="menuitem">📊 لوحة التحكم</a>`,
      '<button class="profile-menu-item profile-menu-danger" type="button" data-action="logout" role="menuitem">🚪 تسجيل الخروج</button>',
      '</div>',
    ].join('');
    return root;
  }

  function wire(root) {
    const avatarBtn = root.querySelector('.profile-avatar');
    const dropdown = root.querySelector('.profile-dropdown');

    const close = () => {
      dropdown.hidden = true;
      avatarBtn.setAttribute('aria-expanded', 'false');
    };

    avatarBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = dropdown.hidden;
      dropdown.hidden = !willOpen;
      avatarBtn.setAttribute('aria-expanded', String(willOpen));
    });

    dropdown.addEventListener('click', (event) => event.stopPropagation());

    root.querySelector('[data-action="logout"]').addEventListener('click', () => {
      close();
      handleLogout();
    });

    root.querySelector('[data-action="profile"]').addEventListener('click', () => {
      close();
      toast('الصفحة الشخصية قريباً ✨');
    });

    document.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }

  function mount() {
    const existing = document.getElementById('profile-menu');
    const user = getUser();

    if (!user) {
      // Logged out — make sure a stale avatar never lingers.
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    const anchor =
      document.querySelector('.nav-auth-container') ||
      document.querySelector('.nav-actions');
    if (!anchor) return;

    const parent = anchor.parentElement || anchor; // sibling of auth container
    const root = buildMenu(user);
    wire(root);
    parent.insertBefore(root, anchor);
  }

  function init() {
    mount();
    // main.js re-renders .nav-auth-container after login/logout; watch it and
    // keep our avatar in sync without any coupling to main.js internals.
    const authContainer = document.querySelector('.nav-auth-container');
    if (authContainer && typeof MutationObserver !== 'undefined') {
      new MutationObserver(mount).observe(authContainer, { childList: true });
    }
    window.addEventListener('storage', (event) => {
      if (!event.key || ['userRole', 'username', 'userId'].includes(event.key)) mount();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
