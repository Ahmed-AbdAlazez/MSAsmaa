import { initNavbar } from './components/navbar.js';

document.addEventListener('DOMContentLoaded', () => {
  const isRegistrationRequestsPage = window.location.pathname.includes('registration-requests.html');
  if (isRegistrationRequestsPage) {
    const role = String(localStorage.getItem('userRole') || '').toLowerCase();
    const token = localStorage.getItem('token');
    if (role !== 'teacher' || !token) {
      window.location.replace('index.html');
      return;
    }
  }

  initNavbar();
  // --- Dark / light theme toggle --------------------------------------------
  // The inline bootstrap script in <head> already applied data-theme
  // (stored choice, else OS preference). Here we only flip it and persist;
  // the sun/moon icon swap itself is pure CSS.
  const themeRoot = document.documentElement;
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = themeRoot.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      themeRoot.setAttribute('data-theme', next);
      try {
        localStorage.setItem('theme', next);
      } catch (_) { /* storage unavailable — theme still applies for this visit */ }
    });
  });

  // --- Authentication (REAL BACKEND ONLY) ----------------------------------
  // Login/signup go to the real backend (VITE_API_URL). There are NO
  // hardcoded accounts and NO localStorage fallback: the backend is the
  // single source of truth for credentials, roles and account status.

  // Login/signup now live on the dedicated auth page (login.html) instead of
  // a modal dialog. Every trigger navigates there; ?mode=signup deep-links
  // straight to the signup tab.
  document.addEventListener('click', (event) => {
    const loginTrigger = event.target.closest('.js-login-trigger');
    if (!loginTrigger) return;

    event.preventDefault();
    window.location.href = 'login.html';
  });

  // --- Mobile Drawer Menu ---
  const navToggle = document.querySelector('.nav-toggle');
  const drawerClose = document.querySelector('.mobile-drawer-close');
  const drawer = document.querySelector('.mobile-drawer');
  const overlay = document.querySelector('.drawer-overlay');

  if (navToggle && drawer && overlay) {
    navToggle.addEventListener('click', () => {
      drawer.classList.add('open');
      overlay.classList.add('show');
    });
  }

  const closeDrawer = () => {
    if (drawer && overlay) {
      drawer.classList.remove('open');
      overlay.classList.remove('show');
    }
  };

  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);

  // --- Dynamic Toast System ---
  window.showToast = (message, type = 'success') => {
    // Remove existing toast if visible
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} show`;

    // Icon selection
    let icon = '✓';
    if (type === 'danger') icon = '✕';
    if (type === 'warning') icon = '⚠';

    toast.innerHTML = `
      <span style="font-weight: bold; font-size: 1.2rem;">${icon}</span>
      <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Fade out after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

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
      return localStorage.getItem('token') || '';
    } catch (_) {
      return '';
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
      el = document.createElement('div');
      el.className = 'upload-floating-status';
      el.innerHTML =
        '<strong class="ufl-title"></strong>' +
        '<div class="upload-progress-bar"><div></div></div>' +
        '<small class="ufl-label"></small>';
      document.body.appendChild(el);
      bar = el.querySelector('.upload-progress-bar > div');
      label = el.querySelector('.ufl-label');
    };

    return {
      markSwOwned(value) {
        swOwned = !!value;
      },
      show(titleText) {
        if (swOwned) return;
        ensure();
        el.style.display = 'block';
        active = true;
        bar.style.width = '0%';
        el.querySelector('.ufl-title').textContent = titleText;
        label.textContent = '0%';
      },
      update(pct, message) {
        if (!el || swOwned) return;
        bar.style.width = pct + '%';
        label.textContent = message || pct + '%';
      },
      done(message) {
        swOwned = false;
        if (!el) return;
        bar.style.width = '100%';
        label.textContent = message;
        setTimeout(() => {
          if (el) el.style.display = 'none';
          active = false;
        }, 4000);
      },
      fail(message) {
        swOwned = false;
        if (!el) return;
        label.textContent = message;
        setTimeout(() => {
          if (el) el.style.display = 'none';
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
  const UPLOAD_CHANNEL_NAME = 'msasmaa-uploads';
  const swUploadAvailable =
    'serviceWorker' in navigator && typeof BroadcastChannel !== 'undefined';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline/dev */ });
  }

  function openUploadDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('msasmaa-uploads', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('jobs', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function idbPutJob(job) {
    const db = await openUploadDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('jobs', 'readwrite');
      tx.objectStore('jobs').put(job);
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
        if (m.type === 'done') {
          cleanup();
          resolve({ ok: true, kind: m.kind });
        } else if (m.type === 'failed') {
          cleanup();
          resolve({ ok: false, error: m.error });
        }
      };
      const cleanup = () => {
        channel.removeEventListener('message', handler);
        channel.close();
      };
      channel.addEventListener('message', handler);
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
      if (m.type === 'started') {
        UploadFloat.markSwOwned(true);
        UploadFloat.show(m.label || 'جاري رفع ملف');
      } else if (m.type === 'progress') {
        UploadFloat.update(m.pct, m.stage === 'finalizing'
          ? 'جاري تحسين الملف على السيرفر...'
          : `جاري الرفع... ${m.pct}%`);
      } else if (m.type === 'done') {
        UploadFloat.done('تم الرفع بنجاح ✔');
      } else if (m.type === 'failed') {
        UploadFloat.fail(`فشل الرفع: ${m.error || ''}`);
      }
    };

    // Restore the card after navigation if jobs are still running.
    navigator.serviceWorker.ready.then((registration) => {
      if (registration.active) {
        registration.active.postMessage({ type: 'GET_ACTIVE_JOBS' });
      }
    });

    const stateChannel = new BroadcastChannel(UPLOAD_CHANNEL_NAME);
    stateChannel.onmessage = (event) => {
      const m = event.data || {};
      if (m.type === 'ACTIVE_JOBS' && m.jobs && m.jobs.length) {
        UploadFloat.show(m.jobs[0].label || 'جاري رفع ملف');
      }
    };
  }
  installUploadUiGlue();

  /** Hands an upload job to the service worker; resolves on its outcome. */
  async function startSwUploadJob(job) {
    await idbPutJob(job);
    try {
      const registration = await navigator.serviceWorker.ready;
      (registration.active || navigator.serviceWorker.controller)
        .postMessage({ type: 'START_UPLOAD', jobId: job.id });
    } catch (error) {
      // Worker unreachable — remove the queued job and signal failure so
      // the caller can fall back to the inline path cleanly.
      try {
        const db = await openUploadDb();
        const tx = db.transaction('jobs', 'readwrite');
        tx.objectStore('jobs').delete(job.id);
      } catch (_) { /* ignore */ }
      return { ok: false, error: error.message };
    }
    return waitForUploadOutcome(job.id);
  }

  // Warn before closing/leaving mid-upload ONLY in fallback mode — with the
  // service worker active, uploads survive navigating to other pages, so
  // warning on every click would just be annoying.
  window.addEventListener('beforeunload', (event) => {
    if (!swUploadAvailable && UploadFloat.isActive) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // Persist upload form fields so typed info (video name, links...) survives
  // navigating between pages and back within the same tab.
  const UPLOAD_PERSIST_FIELDS = ['upload-title', 'upload-attachment', 'upload-description'];
  const restoreUploadFormFields = () => {
    UPLOAD_PERSIST_FIELDS.forEach((fieldId) => {
      const field = document.querySelector(`#${fieldId}`);
      if (!field) return;
      try {
        const savedValue = sessionStorage.getItem(`uploadForm:${fieldId}`);
        if (savedValue !== null && !field.value) field.value = savedValue;
        field.addEventListener('input', () => {
          sessionStorage.setItem(`uploadForm:${fieldId}`, field.value);
        });
      } catch (_) { /* best-effort */ }
    });
  };
  restoreUploadFormFields();

  const fetchJson = async (url, options = {}) => {
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
        `السيرفر في ${url} أعاد رداً غير JSON (كود ${response.status})${preview ? `: ${preview}` : ''}. إن كنت تستخدم Live Server أو GitHub Pages فشغّل node server.js محلياً أو انشر على Vercel مع متغيرات BUNNY.`
      );
    }

    if (!response.ok) {
      // The v1 backend sends { message } (errorMiddleware); older routes send
      // { error }. Show whichever the backend actually returned.
      throw new Error(data.message || data.error || `خطأ من السيرفر (${response.status}).`);
    }
    return data;
  };

  // --- Teacher registration requests --------------------------------------
  // This page uses the existing fetchJson/authHeaders/toast helpers. Its
  // count is always derived from the single GET response; no count endpoint
  // is requested.
  const requestsPage = document.querySelector('#registration-requests-page');
  if (requestsPage) {
    const list = document.querySelector('#registration-requests-list');
    const count = document.querySelector('#pending-requests-count');
    let requests = [];
    let activeRequestId = '';

    const renderRequests = () => {
      count.textContent = String(requests.length);
      list.replaceChildren();

      if (!requests.length) {
        const empty = document.createElement('p');
        empty.className = 'text-muted registration-requests-empty';
        empty.textContent = 'No pending registration requests.';
        list.appendChild(empty);
        return;
      }

      const table = document.createElement('table');
      table.className = 'table registration-requests-table';
      table.innerHTML = '<thead><tr><th>Student Name</th><th>Student Code</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>';
      const body = document.createElement('tbody');

      requests.forEach((request) => {
        const row = document.createElement('tr');
        const date = request.createdAt ? new Date(request.createdAt) : null;
        const displayDate = date && !Number.isNaN(date.getTime())
          ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
          : '—';

        const cells = [request.name || '—', request.studentCode || '—', displayDate];
        cells.forEach((value) => {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.appendChild(cell);
        });

        const statusCell = document.createElement('td');
        const status = document.createElement('span');
        status.className = 'badge badge-warning';
        status.textContent = request.status || 'PENDING';
        statusCell.appendChild(status);
        row.appendChild(statusCell);

        const actionsCell = document.createElement('td');
        actionsCell.className = 'registration-request-actions';
        const approve = document.createElement('button');
        approve.className = 'btn btn-primary';
        approve.type = 'button';
        approve.textContent = activeRequestId === request.id ? 'Approving...' : 'Approve';
        approve.disabled = Boolean(activeRequestId);
        approve.addEventListener('click', () => processRequest(request.id, 'approve'));

        const reject = document.createElement('button');
        reject.className = 'btn btn-danger';
        reject.type = 'button';
        reject.textContent = activeRequestId === request.id ? 'Rejecting...' : 'Reject';
        reject.disabled = Boolean(activeRequestId);
        reject.addEventListener('click', () => processRequest(request.id, 'reject'));
        actionsCell.append(approve, reject);
        row.appendChild(actionsCell);
        body.appendChild(row);
      });

      table.appendChild(body);
      const wrapper = document.createElement('div');
      wrapper.className = 'table-responsive';
      wrapper.appendChild(table);
      list.appendChild(wrapper);
    };

    const loadRequests = async () => {
      list.innerHTML = '<p class="text-muted registration-requests-loading">Loading registration requests...</p>';
      try {
        const data = await fetchJson(`${API_BASE}/registration-requests`, {
          headers: authHeaders(),
        });
        requests = Array.isArray(data?.data?.requests) ? data.data.requests : [];
        renderRequests();
      } catch (error) {
        requests = [];
        count.textContent = '0';
        list.innerHTML = '<p class="text-muted registration-requests-empty">Unable to load registration requests.</p>';
        showToast(error.message, 'danger');
      }
    };

    const processRequest = async (id, action) => {
      if (activeRequestId) return;
      activeRequestId = id;
      renderRequests();
      try {
        const data = await fetchJson(`${API_BASE}/registration-requests/${encodeURIComponent(id)}/${action}`, {
          method: 'PATCH',
          headers: authHeaders(),
        });
        showToast(data.message || `Registration request ${action}d successfully.`, 'success');
        activeRequestId = '';
        await loadRequests();
      } catch (error) {
        activeRequestId = '';
        renderRequests();
        showToast(error.message, 'danger');
      }
    };

    loadRequests();
  }

  // --- Tab Switcher Logic (e.g., Lesson Page) ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  if (tabBtns.length > 0) {
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');

        // Remove active from all buttons & panels
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));

        // Set active on click
        btn.classList.add('active');
        const panel = document.getElementById(targetTab);
        if (panel) panel.classList.add('active');
      });
    });
  }

  // --- Lesson Category Filter (Lessons Listing Page) ---
  const filterBtns = document.querySelectorAll('.filter-btn');
  const lessonCards = document.querySelectorAll('.lesson-card-item');

  if (filterBtns.length > 0 && lessonCards.length > 0) {
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const filterVal = btn.getAttribute('data-filter');

        // Toggle active button class
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Filter cards
        lessonCards.forEach(card => {
          const cardCat = card.getAttribute('data-category');
          if (filterVal === 'all' || cardCat === filterVal) {
            card.style.display = 'block';
            card.style.opacity = '0';
            setTimeout(() => {
              card.style.transition = 'opacity 0.3s ease';
              card.style.opacity = '1';
            }, 50);
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  // --- Mock Student Assignment MCQ & Upload Submission ---
  const assignmentForm = document.querySelector('#assignment-submit-form');
  if (assignmentForm) {
    assignmentForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // Check if MCQ answered
      const chosenMCQ = document.querySelector('input[name="q1"]:checked');
      if (!chosenMCQ) {
        showToast('يرجى اختيار إجابة للسؤال الأول قبل الإرسال!', 'warning');
        return;
      }

      showToast('تم إرسال إجابات الواجب وحفظها بنجاح!', 'success');

      // Stay on page but show score/completion feedback after 1.5 seconds
      setTimeout(() => {
        window.location.href = 'assignments.html';
      }, 1500);
    });

    // Mock drag & drop interaction
    const dropZone = document.querySelector('.file-upload-drag');
    if (dropZone) {
      dropZone.addEventListener('click', () => {
        // Mock selecting a file
        showToast('تم اختيار الملف الملحق (حل الأسئلة المقالية.pdf) بنجاح!', 'success');
        const textElement = dropZone.querySelector('p');
        if (textElement) {
          textElement.innerHTML = '<strong>تم الإرفاق:</strong> حل الأسئلة المقالية.pdf (اضغط لتغيير الملف)';
        }
      });
    }
  }

  // --- Contact Form Submission ---
  const contactForm = document.querySelector('#contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.querySelector('#contact-name').value.trim();
      const email = document.querySelector('#contact-email').value.trim();
      const msg = document.querySelector('#contact-message').value.trim();

      if (!name || !email || !msg) {
        showToast('يرجى إدخال جميع الحقول لإرسال الرسالة الاستفسارية.', 'danger');
        return;
      }

      showToast('تم إرسال رسالتك بنجاح! سيقوم الأستاذ أو طاقم الدعم بالتواصل معك قريباً.', 'success');
      contactForm.reset();
    });
  }

  // --- Teacher Dashboard Mock Buttons ---
  const btnExport = document.querySelector('#btn-teacher-export');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      showToast('جاري تصدير درجات الطلاب بصيغة Excel...', 'success');
    });
  }
  // NOTE: The login/signup form used to be a modal injected here
  // (#login-modal-backdrop). It was replaced by the dedicated auth page:
  //   login.html + css/login.css + src/loginPage.js

  const QUIZZES_STORAGE_KEY = 'frontEndQuizzes';
  const NOTIFICATIONS_STORAGE_KEY = 'frontEndNotifications';

  const getStoredItems = (key, fallbackItems = []) => {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallbackItems));
    } catch (error) {
      return fallbackItems;
    }
  };

  const setStoredItems = (key, items) => {
    localStorage.setItem(key, JSON.stringify(items));
  };

  const getQuizzes = () => getStoredItems(QUIZZES_STORAGE_KEY, [
    {
      id: 'quiz-dna-intro',
      title: 'اختبار سريع: DNA والبروتين',
      chapter: 'الوراثة الجزيئية',
      dueDate: 'اليوم 9:00 م',
      questions: '10',
      questionItems: [
        {
          type: 'mcq',
          text: 'ما الجزء المسؤول عن حمل الشفرة الوراثية؟',
          options: ['DNA', 'الجدار الخلوي', 'الريبوسوم', 'السيتوبلازم'],
          image: ''
        },
        {
          type: 'written',
          text: 'اشرح باختصار خطوات تضاعف DNA.',
          options: [],
          image: ''
        }
      ],
      note: 'اختبار قصير للتأكد من فهم تضاعف DNA والترجمة.',
      createdAt: 'جاهز الآن'
    }
  ]);

  let cachedNotifications = [];

  const fetchNotifications = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) return [];
    try {
      const data = await fetchJson('/api/notifications', {
        headers: authHeaders(),
      });
      cachedNotifications = data.notifications || [];
      return cachedNotifications;
    } catch (error) {
      console.warn('[notifications] Failed to fetch notifications:', error);
      return cachedNotifications;
    }
  };

  const addNotification = (title, message, type = 'news') => {
    console.warn('[notifications] Local addNotification is deprecated. Trigger notifications via backend instead.');
  };

  const updateNotificationBadge = async () => {
    const notifications = await fetchNotifications();
    const unreadCount = notifications.filter((item) => !item.read).length;
    document.querySelectorAll('.notification-count').forEach((badge) => {
      badge.textContent = unreadCount;
      badge.hidden = unreadCount === 0;
    });
  };

  const renderNotificationsMenu = async () => {
    const notifications = await fetchNotifications();
    const list = document.querySelector('#notification-list');
    if (!list) return;

    if (!notifications.length) {
      list.innerHTML = '<div class="notification-empty">لا توجد إشعارات جديدة الآن.</div>';
      return;
    }

    list.innerHTML = notifications.slice(0, 6).map((item) => `
      <div class="notification-item ${item.read ? '' : 'unread'}" data-id="${item.id}" data-link="${item.link || ''}">
        <div class="notification-item-icon">${item.type === 'quiz' ? '؟' : '!'}</div>
        <div>
          <h4>${item.title}</h4>
          <p>${item.message}</p>
        </div>
      </div>
    `).join('');

    // Bind click events on notification items to mark read on the backend and navigate
    list.querySelectorAll('.notification-item').forEach((item) => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        const link = item.dataset.link;
        try {
          await fetchJson(`/api/notifications/${id}/read`, {
            method: 'POST',
            headers: authHeaders(),
          });
          await updateNotificationBadge();
          if (link) {
            window.location.href = link;
          }
        } catch (error) {
          console.error('[notifications] Failed to mark read:', error);
          if (link) {
            window.location.href = link;
          }
        }
      });
    });
  };

  const escapeHTML = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const fileToDataURL = (file) => new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', reject);
    reader.readAsDataURL(file);
  });

  const getQuizQuestionCount = (quiz) => {
    if (Array.isArray(quiz.questionItems) && quiz.questionItems.length) {
      return quiz.questionItems.length;
    }

    return Number.parseInt(quiz.questions, 10) || 0;
  };

  const renderQuestionSummary = (question, index) => {
    const typeLabel = question.type === 'written' ? 'Written' : 'MCQ';
    const options = question.type === 'mcq' && question.options?.length
      ? `<ol class="quiz-question-options">${question.options.map((option) => `<li>${escapeHTML(option)}</li>`).join('')}</ol>`
      : '<p class="quiz-written-answer-line">مساحة إجابة كتابية للطالب</p>';
    const image = question.image
      ? `<img src="${question.image}" alt="Question attachment" class="quiz-question-image">`
      : '';

    return `
      <article class="quiz-question-preview">
        <div class="quiz-question-top">
          <span class="quiz-question-number">${index + 1}</span>
          <span class="badge ${question.type === 'written' ? 'badge-warning' : 'badge-success'}">${typeLabel}</span>
        </div>
        <p>${escapeHTML(question.text)}</p>
        ${image}
        ${options}
      </article>
    `;
  };

  const renderStudentQuizList = () => {
    const list = document.querySelector('#student-quiz-list');
    if (!list) return;

    const quizzes = getQuizzes();
    list.innerHTML = quizzes.map((quiz) => `
      <div class="quiz-item">
        <div class="quiz-item-icon">؟</div>
        <div class="quiz-item-content">
          <h4>${escapeHTML(quiz.title)}</h4>
          <p>${escapeHTML(quiz.chapter)} • ${getQuizQuestionCount(quiz)} أسئلة • التسليم: ${escapeHTML(quiz.dueDate)}</p>
          <div class="quiz-question-preview-list" hidden>
            ${(quiz.questionItems || []).map(renderQuestionSummary).join('')}
          </div>
        </div>
        <button class="btn btn-primary btn-quiz-start" type="button" data-quiz-title="${escapeHTML(quiz.title)}">ابدأ</button>
      </div>
    `).join('');

    list.querySelectorAll('.btn-quiz-start').forEach((button) => {
      button.addEventListener('click', () => {
        const previewList = button.closest('.quiz-item')?.querySelector('.quiz-question-preview-list');
        if (previewList) previewList.hidden = !previewList.hidden;
        showToast(`بدأت اختبار "${button.dataset.quizTitle}" داخل الواجهة فقط.`, 'success');
      });
    });
  };

  const renderTeacherQuizList = () => {
    const list = document.querySelector('#teacher-quiz-list');
    if (!list) return;

    const quizzes = getQuizzes();
    list.innerHTML = quizzes.slice(0, 5).map((quiz) => `
      <div class="quiz-mini-row">
        <span class="quiz-mini-icon">؟</span>
        <div>
          <strong>${quiz.title}</strong>
          <small>${quiz.chapter} • ${quiz.dueDate}</small>
        </div>
      </div>
    `).join('');
  };

  const initializeQuizExperience = () => {
    const dashboardContainer = document.querySelector('.dashboard-layout .container');
    if (!dashboardContainer) {
      renderNotificationsMenu();
      updateNotificationBadge();
      return;
    }

    if (window.location.pathname.includes('dashboard-teacher.html') && !document.querySelector('#teacher-quiz-panel')) {
      const studentRecordsTitle = Array.from(document.querySelectorAll('.dashboard-section-title')).find((title) =>
        title.textContent.includes('قائمة') || title.textContent.includes('أداء')
      );
      const quizPanel = document.createElement('section');
      quizPanel.id = 'teacher-quiz-panel';
      quizPanel.className = 'quiz-workspace teacher-quiz-workspace';
      quizPanel.innerHTML = `
        <div class="quiz-panel-header">
          <div>
            <span class="section-tag">Quizzes</span>
            <h2>إرسال اختبار جديد للطلاب</h2>
            <p>تستطيع أ. أسماء إنشاء اختبار سريع، وسيظهر فوراً في لوحة الطالب مع إشعار جديد.</p>
          </div>
          <div class="quiz-icon-badge" title="الاختبارات">؟</div>
        </div>
        <form id="teacher-quiz-form" class="quiz-form">
          <div class="form-group">
            <label for="quiz-title" class="form-label">عنوان الاختبار</label>
            <input type="text" id="quiz-title" class="form-input" placeholder="مثال: اختبار الدعامة والحركة" required>
          </div>
          <div class="form-group">
            <label for="quiz-chapter" class="form-label">الفصل</label>
            <select id="quiz-chapter" class="form-input" required>
              <option value="الدعامة والحركة">الدعامة والحركة</option>
              <option value="التنسيق الهرموني">التنسيق الهرموني</option>
              <option value="التكاثر">التكاثر</option>
              <option value="DNA و RNA">DNA و RNA</option>
            </select>
          </div>
          <div class="form-group">
            <label for="quiz-questions" class="form-label">عدد الأسئلة</label>
            <input type="number" id="quiz-questions" class="form-input" min="1" max="50" value="10" required>
          </div>
          <div class="form-group">
            <label for="quiz-due-date" class="form-label">موعد التسليم</label>
            <input type="text" id="quiz-due-date" class="form-input" placeholder="اليوم 9:00 م" required>
          </div>
          <div class="form-group quiz-form-wide">
            <label for="quiz-note" class="form-label">ملاحظة للطلاب</label>
            <textarea id="quiz-note" class="form-input" placeholder="اكتب تعليمات قصيرة للطلاب..." required></textarea>
          </div>
          <div class="quiz-question-builder quiz-form-wide">
            <div class="quiz-question-builder-head">
              <div>
                <h3>أسئلة الامتحان</h3>
                <p>اختاري نوع السؤال، واكتبي السؤال، ويمكنك إضافة صورة توضيحية.</p>
              </div>
              <span class="badge badge-success" id="quiz-draft-count">0 أسئلة</span>
            </div>
            <div class="quiz-question-grid">
              <div class="form-group">
                <label for="quiz-question-type" class="form-label">نوع السؤال</label>
                <select id="quiz-question-type" class="form-input">
                  <option value="mcq">اختيار من متعدد MCQ</option>
                  <option value="written">سؤال مقالي / Written</option>
                </select>
              </div>
              <div class="form-group">
                <label for="quiz-question-image" class="form-label">صورة مع السؤال</label>
                <input type="file" id="quiz-question-image" class="form-input" accept="image/*">
              </div>
              <div class="form-group quiz-form-wide">
                <label for="quiz-question-text" class="form-label">نص السؤال</label>
                <textarea id="quiz-question-text" class="form-input" placeholder="اكتبي السؤال هنا..."></textarea>
              </div>
              <div id="quiz-mcq-options" class="quiz-mcq-options quiz-form-wide">
                <input type="text" class="form-input quiz-option-input" placeholder="الاختيار الأول">
                <input type="text" class="form-input quiz-option-input" placeholder="الاختيار الثاني">
                <input type="text" class="form-input quiz-option-input" placeholder="الاختيار الثالث">
                <input type="text" class="form-input quiz-option-input" placeholder="الاختيار الرابع">
              </div>
              <button type="button" id="btn-add-quiz-question" class="btn btn-secondary quiz-form-wide">إضافة السؤال للامتحان</button>
            </div>
            <div id="quiz-draft-questions" class="quiz-question-preview-list"></div>
          </div>
          <button type="submit" class="btn btn-primary quiz-form-wide">إرسال الاختبار للطلاب</button>
        </form>
        <div class="quiz-created-list" id="teacher-quiz-list"></div>
      `;

      if (studentRecordsTitle) {
        studentRecordsTitle.before(quizPanel);
      } else {
        dashboardContainer.appendChild(quizPanel);
      }

      const draftQuestions = [];
      const questionTypeSelect = quizPanel.querySelector('#quiz-question-type');
      const questionTextInput = quizPanel.querySelector('#quiz-question-text');
      const questionImageInput = quizPanel.querySelector('#quiz-question-image');
      const mcqOptionsBox = quizPanel.querySelector('#quiz-mcq-options');
      const draftQuestionsList = quizPanel.querySelector('#quiz-draft-questions');
      const draftCount = quizPanel.querySelector('#quiz-draft-count');

      const resetQuestionBuilder = () => {
        questionTextInput.value = '';
        questionImageInput.value = '';
        quizPanel.querySelectorAll('.quiz-option-input').forEach((input) => {
          input.value = '';
        });
      };

      const renderDraftQuestions = () => {
        draftCount.textContent = `${draftQuestions.length} أسئلة`;
        draftQuestionsList.innerHTML = draftQuestions.length
          ? draftQuestions.map(renderQuestionSummary).join('')
          : '<p class="quiz-draft-empty">لم تتم إضافة أسئلة بعد.</p>';
      };

      questionTypeSelect.addEventListener('change', () => {
        mcqOptionsBox.hidden = questionTypeSelect.value === 'written';
      });

      quizPanel.querySelector('#btn-add-quiz-question').addEventListener('click', async () => {
        const questionText = questionTextInput.value.trim();
        const questionType = questionTypeSelect.value;
        const options = Array.from(quizPanel.querySelectorAll('.quiz-option-input'))
          .map((input) => input.value.trim())
          .filter(Boolean);

        if (!questionText) {
          showToast('اكتبي نص السؤال أولاً.', 'warning');
          questionTextInput.focus();
          return;
        }

        if (questionType === 'mcq' && options.length < 2) {
          showToast('سؤال MCQ يحتاج اختيارين على الأقل.', 'warning');
          return;
        }

        const image = await fileToDataURL(questionImageInput.files[0]);
        draftQuestions.push({
          type: questionType,
          text: questionText,
          options: questionType === 'mcq' ? options : [],
          image
        });

        renderDraftQuestions();
        resetQuestionBuilder();
        showToast('تمت إضافة السؤال للامتحان.', 'success');
      });

      renderDraftQuestions();

      quizPanel.querySelector('#teacher-quiz-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const quiz = {
          id: `quiz-${Date.now()}`,
          title: document.querySelector('#quiz-title').value.trim(),
          chapter: document.querySelector('#quiz-chapter').value,
          dueDate: document.querySelector('#quiz-due-date').value.trim(),
          questions: draftQuestions.length,
          questionItems: [...draftQuestions],
          note: document.querySelector('#quiz-note').value.trim(),
          createdAt: 'تم الإرسال الآن'
        };

        if (!quiz.title || !quiz.dueDate || !quiz.note) {
          showToast('يرجى إكمال بيانات الاختبار قبل الإرسال.', 'warning');
          return;
        }

        if (!draftQuestions.length) {
          showToast('أضيفي سؤالاً واحداً على الأقل قبل إرسال الامتحان.', 'warning');
          return;
        }

        const quizzes = getQuizzes();
        quizzes.unshift(quiz);
        setStoredItems(QUIZZES_STORAGE_KEY, quizzes);
        
        // Publish notification to backend
        fetchJson('/api/notifications/quiz', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({ title: quiz.title }),
        })
          .then(() => {
            updateNotificationBadge();
          })
          .catch((err) => {
            console.error('[quiz] Failed to notify backend:', err);
          });

        renderTeacherQuizList();
        quizPanel.querySelector('#teacher-quiz-form').reset();
        draftQuestions.length = 0;
        renderDraftQuestions();
        document.querySelector('#quiz-questions').value = 10;
        showToast('تم إرسال الاختبار للطلاب وظهوره في الإشعارات.', 'success');
      });
    }

    if (window.location.pathname.includes('dashboard-student.html') && !document.querySelector('#student-quiz-panel')) {
      const tasksTitle = Array.from(document.querySelectorAll('.dashboard-section-title')).find((title) =>
        title.textContent.includes('المهام') || title.textContent.includes('الواجبات')
      );
      const quizPanel = document.createElement('section');
      quizPanel.id = 'student-quiz-panel';
      quizPanel.className = 'quiz-workspace student-quiz-workspace';
      quizPanel.innerHTML = `
        <div class="quiz-panel-header">
          <div>
            <span class="section-tag">Quizzes</span>
            <h2>اختبارات مرسلة من المعلمة</h2>
            <p>أي اختبار جديد ترسله أ. أسماء يظهر هنا مباشرة مع إشعار في الأعلى.</p>
          </div>
          <div class="quiz-icon-badge" title="الاختبارات">؟</div>
        </div>
        <div id="student-quiz-list" class="student-quiz-list"></div>
      `;

      if (tasksTitle?.parentElement) {
        tasksTitle.parentElement.prepend(quizPanel);
      } else {
        dashboardContainer.appendChild(quizPanel);
      }
    }

    renderTeacherQuizList();
    renderStudentQuizList();
    renderNotificationsMenu();
    updateNotificationBadge();
  };

  const getNotificationButtonHTML = () => `
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

  // Populate auth placeholders dynamically
  const updateAuthUI = () => {
    const userRole = localStorage.getItem('userRole');
    const username = localStorage.getItem('username') || '';

    // Update any username greeting placeholders on dashboard
    const namePlaceholders = document.querySelectorAll('.student-name-placeholder');
    namePlaceholders.forEach(el => {
      el.textContent = username || 'طالب زائر';
    });

    const navAuthContainer = document.querySelector('.nav-auth-container');
    const mobileAuthContainer = document.querySelector('.mobile-auth-container');

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
        mobileAuthContainer.innerHTML = `
          <button class="btn btn-light btn-full" id="mobile-notifications-btn">الإشعارات الجديدة</button>
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
          <button class="btn btn-light btn-full" id="mobile-notifications-btn">الإشعارات الجديدة</button>
          <button class="btn btn-primary btn-full" id="mobile-login-btn">تسجيل الدخول</button>
        `;
      }
    }

    // Bind Auth Button Clicks
    const authBtn = document.querySelector('#auth-action-btn');
    if (authBtn) {
      authBtn.addEventListener('click', handleAuthAction);
    }

    const notificationBtn = document.querySelector('#notification-btn');
    const notificationMenu = document.querySelector('#notification-menu');
    if (notificationBtn && notificationMenu) {
      notificationBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await renderNotificationsMenu();
        notificationMenu.classList.toggle('show');
      });
    }

    const markNotificationsRead = document.querySelector('#mark-notifications-read');
    if (markNotificationsRead) {
      markNotificationsRead.addEventListener('click', async () => {
        try {
          await fetchJson('/api/notifications/mark-all-read', {
            method: 'POST',
            headers: authHeaders(),
          });
          await renderNotificationsMenu();
          await updateNotificationBadge();
        } catch (error) {
          console.error('[notifications] Failed to mark all read:', error);
        }
      });
    }

    const mobileNotificationsBtn = document.querySelector('#mobile-notifications-btn');
    if (mobileNotificationsBtn) {
      mobileNotificationsBtn.addEventListener('click', async () => {
        const notifications = await fetchNotifications();
        const latestNotification = notifications[0];
        showToast(latestNotification?.message || 'لا توجد إشعارات جديدة الآن.', latestNotification?.type === 'quiz' ? 'success' : 'warning');
      });
    }

    const mobileLogoutBtn = document.querySelector('#mobile-logout-btn');
    if (mobileLogoutBtn) {
      mobileLogoutBtn.addEventListener('click', handleLogout);
    }

    const mobileLoginBtn = document.querySelector('#mobile-login-btn');
    if (mobileLoginBtn) {
      mobileLoginBtn.addEventListener('click', () => {
        window.location.href = 'login.html';
      });
    }

    renderNotificationsMenu();
    updateNotificationBadge();
  };

  document.addEventListener('click', (event) => {
    const notificationCenter = document.querySelector('.notification-center');
    const notificationMenu = document.querySelector('#notification-menu');
    if (notificationCenter && notificationMenu && !notificationCenter.contains(event.target)) {
      notificationMenu.classList.remove('show');
    }
  });

  const handleAuthAction = () => {
    const userRole = localStorage.getItem('userRole');
    if (userRole) {
      handleLogout();
    } else {
      window.location.href = 'login.html';
    }
  };

  const handleLogout = () => {
    if (confirm('هل تريد بالتأكيد تسجيل الخروج من الحساب؟')) {
      localStorage.removeItem('userRole');
      localStorage.removeItem('username');
      localStorage.removeItem('userId');
      localStorage.removeItem('token');
      showToast('تم تسجيل الخروج بنجاح. نتمنى رؤيتك قريباً! 👋', 'success');
      updateAuthUI();
      // Redirect to index page
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 800);
    }
  };

  // NOTE: Login/signup submission now lives on the dedicated auth page
  // (src/loginPage.js) with identical endpoints, payloads and validation.

  // Initialize Auth UI
  updateAuthUI();
  initializeQuizExperience();

  // Add teacher student addition mock button trigger
  const btnAddStudent = document.querySelector('#btn-teacher-add');
  if (btnAddStudent) {
    btnAddStudent.addEventListener('click', () => {
      const studentName = prompt('أدخل اسم الطالب الجديد لتسجيله:');
      if (studentName) {
        showToast(`تم تسجيل الطالب "${studentName}" بنجاح في المنصة!`, 'success');
      }
    });
  }

  // --- Accordion Expand/Collapse Logic ---
  const accordionHeaders = document.querySelectorAll('.accordion-header');
  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const body = item.querySelector('.accordion-body');

      const isActive = item.classList.contains('active');

      if (isActive) {
        item.classList.remove('active');
        body.style.maxHeight = null;
      } else {
        item.classList.add('active');
        body.style.maxHeight = body.scrollHeight + 'px';
      }
    });
  });

  // Initialize active accordions heights
  const activeAccordions = document.querySelectorAll('.accordion-item.active .accordion-body');
  activeAccordions.forEach(body => {
    body.style.maxHeight = body.scrollHeight + 'px';
  });

  // --- Dynamic URL Parameter Parsing for lesson-view.html ---
  if (window.location.pathname.includes('lesson-view.html')) {
    const urlParams = new URLSearchParams(window.location.search);
    const titleParam = urlParams.get('title');
    if (titleParam) {
      const decodedTitle = decodeURIComponent(titleParam);

      // Update page title tag
      document.title = `عرض الدرس | ${decodedTitle} | منصة المرسال`;

      // Update breadcrumbs title
      const bcTitle = document.querySelector('#lesson-breadcrumb-title');
      if (bcTitle) {
        bcTitle.textContent = decodedTitle;
      }

      // Update page heading
      const heading = document.querySelector('#lesson-name-heading');
      if (heading) {
        heading.textContent = decodedTitle;
      }

      // Update video overlay player title
      const videoTitle = document.querySelector('#lesson-video-title');
      if (videoTitle) {
        videoTitle.textContent = `شرح درس: ${decodedTitle}`;
      }
    }

    // --- Lesson identity + shared page elements ---
    const lessonId = urlParams.get('lesson') || urlParams.get('id') || 'lesson-1';
    const playBtn = document.querySelector('.video-play-btn');
    const playerBox = document.querySelector('.video-player-mock');
    const durationEl = document.querySelector('#lesson-video-duration');
    const materialsBox = document.querySelector('#lesson-materials-list');

    // Inline PDF viewer (markup lives in lesson-view.html).
    const viewerPanel = document.querySelector('#lesson-pdf-viewer');
    const viewerTitle = document.querySelector('#lesson-pdf-viewer-title');
    const viewerFrame = document.querySelector('#lesson-pdf-frame');
    const viewerClose = document.querySelector('#lesson-pdf-viewer-close');

    // Auth headers come from the shared JWT helper (authHeaders() above).

    // Lesson videos state (filled by applyVideosData below).
    let lessonVideos = [];
    let currentVideoIdx = 0;

    /** "75" seconds -> "1:15" for the player overlay. */
    const formatDuration = (totalSeconds) => {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

    /** Part buttons under the player when a lesson has several videos. */
    const renderVideoChooser = () => {
      if (!playerBox || lessonVideos.length <= 1) return;

      let chooser = document.querySelector('#lesson-video-chooser');
      if (!chooser) {
        chooser = document.createElement('div');
        chooser.id = 'lesson-video-chooser';
        chooser.style.cssText =
          'display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.75rem;';
        playerBox.insertAdjacentElement('afterend', chooser);
      }
      chooser.innerHTML = '';

      lessonVideos.forEach((video, idx) => {
        const partBtn = document.createElement('button');
        partBtn.type = 'button';
        partBtn.className = 'btn btn-secondary';
        partBtn.style.cssText =
          'font-size:0.85rem; padding:0.4rem 0.9rem;' +
          (idx === currentVideoIdx ? ' font-weight:700;' : '');
        partBtn.textContent = video.name || `الجزء ${idx + 1}`;
        if (!video.ready) partBtn.textContent += ' (قيد المعالجة)';
        partBtn.addEventListener('click', () => {
          currentVideoIdx = idx;
          renderVideoChooser();
          // Once playback started, switching parts loads them instantly.
          if (playerBox.querySelector('iframe')) {
            if (video.ready) {
              showToast(`جاري تشغيل: ${partBtn.textContent}`, 'success');
              loadIframe(video);
            } else {
              showToast('هذا الجزء ما زال قيد المعالجة على Bunny.', 'warning');
            }
          }
        });
        chooser.appendChild(partBtn);
      });
    };

    /** Shows the inline PDF viewer panel with a short-lived signed URL. */
    const openMaterialInViewer = async (material, triggerButton) => {
      try {
        if (triggerButton) triggerButton.disabled = true;
        const data = await fetchJson(
          `/api/materials/${encodeURIComponent(material.id)}/download?mode=inline`,
          { headers: authHeaders() }
        );
        if (!viewerPanel || !viewerFrame) {
          window.open(data.downloadUrl, '_blank', 'noopener');
          return;
        }
        viewerTitle.textContent = material.title || 'ملف PDF';
        viewerFrame.src = data.downloadUrl;
        viewerPanel.hidden = false;
        viewerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        showToast(error.message, 'danger');
      } finally {
        if (triggerButton) triggerButton.disabled = false;
      }
    };

    const closePdfViewer = () => {
      if (!viewerPanel) return;
      viewerPanel.hidden = true;
      if (viewerFrame) viewerFrame.src = 'about:blank';
    };

    if (viewerClose && viewerPanel) {
      viewerClose.addEventListener('click', closePdfViewer);
    }

    /** Renders the PDF materials list in the sidebar. */
    const renderLessonMaterials = (materialsList) => {
      if (!materialsBox) return;
      materialsBox.innerHTML = '';

      if (!materialsList.length) {
        materialsBox.innerHTML =
          '<p class="text-muted" style="font-size:0.9rem; margin:0;">لا توجد ملفات PDF لهذا الدرس بعد.</p>';
        return;
      }

      materialsList.forEach((material) => {
        const row = document.createElement('div');
        row.className = 'lesson-material-item';

        const title = document.createElement('div');
        title.className = 'lesson-material-title';
        title.textContent = material.title || 'ملف PDF';

        const actionsBox = document.createElement('div');
        actionsBox.className = 'lesson-material-actions';

        // عرض: renders the PDF inline beside/below the video player.
        const viewButton = document.createElement('button');
        viewButton.className = 'btn btn-secondary lesson-material-download';
        viewButton.type = 'button';
        viewButton.textContent = 'عرض';
        viewButton.addEventListener('click', () => openMaterialInViewer(material, viewButton));

        const downloadButton = document.createElement('button');
        downloadButton.className = 'btn btn-secondary lesson-material-download';
        downloadButton.type = 'button';
        downloadButton.textContent = 'تحميل';
        downloadButton.addEventListener('click', async () => {
          try {
            downloadButton.disabled = true;
            downloadButton.textContent = 'جاري...';
            const data = await fetchJson(
              `/api/materials/${encodeURIComponent(material.id)}/download`,
              { headers: authHeaders() }
            );
            window.open(data.downloadUrl, '_blank', 'noopener');
          } catch (error) {
            showToast(error.message, 'danger');
          } finally {
            downloadButton.disabled = false;
            downloadButton.textContent = 'تحميل';
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
        if (!entry || typeof entry.fetchedAt !== 'number') return null;
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
          JSON.stringify({ data, fetchedAt: Date.now() })
        );
      } catch (_) { /* storage full/unavailable — caching stays best-effort */ }
    };

    const cachedMaterials = lessonCacheRead('materials', lessonId);
    if (cachedMaterials && cachedMaterials.fresh) {
      renderLessonMaterials(cachedMaterials.data || []);
      fetchJson(`/api/lessons/${lessonId}/materials`, {
        headers: authHeaders(),
      })
        .then((freshData) => {
          const nextMaterials = freshData.materials || [];
          lessonCacheWrite('materials', lessonId, nextMaterials);
          if (
            JSON.stringify(nextMaterials) !== JSON.stringify(cachedMaterials.data)
          ) {
            renderLessonMaterials(nextMaterials);
          }
        })
        .catch(() => { /* keep showing cached list */ });
    } else {
      fetchJson(`/api/lessons/${lessonId}/materials`, {
        headers: authHeaders(),
      })
        .then((data) => {
          const materials = data.materials || [];
          lessonCacheWrite('materials', lessonId, materials);
          renderLessonMaterials(materials);
        })
        .catch((error) => {
          const materialsBox = document.querySelector('#lesson-materials-list');
          if (materialsBox) {
            materialsBox.innerHTML =
              '<p class="text-muted" style="font-size:0.9rem; margin:0;">تعذر تحميل ملفات الدرس.</p>';
          }
          console.warn('[materials] list failed:', error);
        });
    }

    const applyVideosData = (data) => {
      lessonVideos = data.videos || [];

      if (!lessonVideos.length) {
        if (durationEl) {
          durationEl.textContent = 'لا يوجد فيديو مرفوع لهذا الدرس بعد';
        }
        return;
      }

      // Show the first ready video's real duration in the overlay.
      const readyVideo = lessonVideos.find((v) => v.ready);
      if (durationEl) {
        if (!readyVideo) {
          durationEl.textContent = 'أ. أسماء مرسال | ⏳ جاري معالجة الفيديو...';
        } else if (readyVideo.lengthSeconds) {
          durationEl.textContent =
            `أ. أسماء مرسال | ⏱ ${formatDuration(readyVideo.lengthSeconds)}`;
        }
      }

      // Start from the first READY video (skip still-processing parts).
      const readyIdx = lessonVideos.findIndex((v) => v.ready);
      currentVideoIdx = readyIdx >= 0 ? readyIdx : 0;

      renderVideoChooser();
    };

    const cachedVideos = lessonCacheRead('videos', lessonId);
    if (cachedVideos && cachedVideos.fresh) {
      applyVideosData(cachedVideos.data);
      fetchJson(`/api/lessons/${lessonId}/videos`, {
        headers: authHeaders(),
      })
        .then((freshData) => {
          const nextVideos = freshData.videos || [];
          lessonCacheWrite('videos', lessonId, nextVideos);
          if (JSON.stringify(nextVideos) !== JSON.stringify(cachedVideos.data)) {
            applyVideosData(freshData);
          }
        })
        .catch(() => { /* keep showing cached playlist */ });
    } else {
      fetchJson(`/api/lessons/${lessonId}/videos`, {
        headers: authHeaders(),
      })
        .then((data) => {
          lessonCacheWrite('videos', lessonId, data.videos || []);
          applyVideosData(data);
        })
        .catch(() => {
          /* endpoint errors already surface when the user presses play */
        });
    }

    if (playBtn && playerBox) {
      playBtn.addEventListener('click', async () => {
        if (!lessonVideos.length) {
          showToast('لا يوجد فيديو مرفوع لهذا الدرس بعد.', 'warning');
          return;
        }

        const videoEntry = lessonVideos[currentVideoIdx];
        if (!videoEntry.ready) {
          showToast('الفيديو ما زال قيد المعالجة على Bunny، حاولي بعد قليل.', 'warning');
          return;
        }

        playBtn.disabled = true;
        showToast('جاري تشغيل الفيديو...', 'success');
        loadIframe(videoEntry);
      });
    }
  }

  // --- Teacher dashboard: video upload to Bunny Stream ---
  const chapterSelect = document.querySelector('#upload-chapter');
  const lessonSelect = document.querySelector('#upload-lesson');

  // Populate the chapter -> lesson dependent dropdowns from the curriculum.
  if (chapterSelect && lessonSelect && window.CURRICULUM) {
    const fillLessons = (chapterIdx) => {
      const chapter = window.CURRICULUM.biology[chapterIdx];
      lessonSelect.innerHTML = '';
      chapter.lessons.forEach((lesson) => {
        const opt = document.createElement('option');
        opt.value = lesson.id;
        opt.textContent = `${chapter.name.split(':')[0]} — ${lesson.name} (${lesson.id})`;
        lessonSelect.appendChild(opt);
      });
    };

    window.CURRICULUM.biology.forEach((chapter, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = chapter.name;
      chapterSelect.appendChild(opt);
    });

    chapterSelect.addEventListener('change', () => fillLessons(Number(chapterSelect.value)));
    fillLessons(0);
  }

  const uploadBtn = document.querySelector('#btn-upload-video');
  const uploadMaterialBtn = document.querySelector('#btn-upload-material');
  const uploadSelectedMaterial = async (onProgress) => {
    const titleInput = document.querySelector('#upload-title');
    const pdfInput = document.querySelector('#upload-pdf-file');
    const lessonId = lessonSelect ? lessonSelect.value : '';
    const pdfFile = pdfInput?.files[0];

    if (!lessonId) {
      showToast('اختاري الفصل والدرس أولاً.', 'warning');
      return null;
    }

    if (!pdfFile) {
      showToast('اختاري ملف PDF أولاً.', 'warning');
      return null;
    }

    if (pdfFile.type !== 'application/pdf' && !/\.pdf$/i.test(pdfFile.name)) {
      showToast('ملفات PDF فقط مسموح بها.', 'warning');
      return null;
    }

    if ((localStorage.getItem('userRole') || 'student') !== 'teacher') {
      showToast('رفع ملفات PDF متاح لحساب المعلمة فقط.', 'danger');
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ fileName: pdfFile.name }),
      }
    );

    let result;
    if (swUploadAvailable) {
      // BACKGROUND PATH: hand the whole upload (bytes PUT + finalize) to the
      // service worker so navigating to other pages cannot interrupt it.
      const jobId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const outcome = await startSwUploadJob({
        id: jobId,
        kind: 'pdf',
        url: prepared.signedUrl,
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        blob: pdfFile,
        finalize: {
          url: `/api/materials/finalize`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            lessonId,
            filePath: prepared.filePath,
            title: formDataTitle,
          }),
        },
        meta: { lessonId, label: `PDF: ${formDataTitle}` },
        status: 'queued',
      });

      if (!outcome.ok) {
        throw new Error(outcome.error || 'فشل رفع ملف PDF.');
      }
      result = {};
    } else {
      // INLINE FALLBACK (no service worker): classic in-page XHR upload.
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', prepared.signedUrl);
        xhr.setRequestHeader('Content-Type', 'application/pdf');

        if (typeof onProgress === 'function') {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              onProgress(Math.round((e.loaded / e.total) * 100), null);
            }
          });
        }

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`فشل رفع الملف (${xhr.status}).`));
          }
        });

        xhr.addEventListener('error', () =>
          reject(new Error('انقطع الاتصال أثناء رفع ملف PDF.'))
        );

        xhr.send(pdfFile);
      });

      if (typeof onProgress === 'function') onProgress(100, 'جاري تحسين الملف على السيرفر...');

      result = await fetchJson(`/api/materials/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
    } catch (_) { /* best-effort */ }

    pdfInput.value = '';
    showToast('تم رفع ملف PDF للدرس بنجاح.', 'success');
    return result;
  };

  if (uploadMaterialBtn) {
    uploadMaterialBtn.addEventListener('click', async () => {
      // Same progress UI the video upload uses.
      const progressArea = document.querySelector('#upload-progress-area');
      const progressBar = document.querySelector('#upload-progress-bar');
      const statusText = document.querySelector('#upload-status-text');

      try {
        uploadMaterialBtn.disabled = true;
        UploadFloat.show('جاري رفع ملف PDF');
        if (progressArea && progressBar && statusText) {
          progressArea.style.display = 'block';
          progressBar.style.width = '0%';
          statusText.textContent = 'جاري تجهيز الملف...';
        }

        await uploadSelectedMaterial((pct, statusMsg) => {
          if (progressBar && statusText) {
            progressBar.style.width = pct + '%';
            statusText.textContent = statusMsg || `جاري رفع ملف الـ PDF... ${pct}%`;
          }
          UploadFloat.update(pct, statusMsg || `جاري رفع ملف الـ PDF... ${pct}%`);
        });

        if (progressBar && statusText) {
          progressBar.style.width = '100%';
          statusText.textContent = 'تم رفع ملف PDF للدرس بنجاح ✔';
        }
        UploadFloat.done('تم رفع ملف PDF للدرس بنجاح ✔');
      } catch (error) {
        showToast(error.message, 'danger');
        if (statusText) statusText.textContent = 'فشل رفع ملف PDF.';
        UploadFloat.fail('فشل رفع ملف PDF.');
      } finally {
        uploadMaterialBtn.disabled = false;
      }
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      const titleInput = document.querySelector('#upload-title');
      const attachmentInput = document.querySelector('#upload-attachment');
      const descriptionInput = document.querySelector('#upload-description');
      const fileInput = document.querySelector('#upload-file');
      const pdfInput = document.querySelector('#upload-pdf-file');
      const progressArea = document.querySelector('#upload-progress-area');
      const progressBar = document.querySelector('#upload-progress-bar');
      const statusText = document.querySelector('#upload-status-text');

      const lessonId = lessonSelect ? lessonSelect.value : '';
      const videoName = (titleInput?.value || '').trim();
      const attachmentUrl = (attachmentInput?.value || '').trim();
      const description = (descriptionInput?.value || '').trim();
      const file = fileInput?.files[0];
      const pdfFile = pdfInput?.files[0];

      if (!lessonId) {
        showToast('اختاري الفصل والدرس أولاً.', 'warning');
        return;
      }
      if (!videoName) {
        showToast('اكتبي اسم الفيديو.', 'warning');
        titleInput.focus();
        return;
      }
      if (!file) {
        showToast('اختاري ملف الفيديو.', 'warning');
        return;
      }

      // Only teachers may upload (UI hint only — the backend enforces the
      // real role from the JWT).
      if ((localStorage.getItem('userRole') || 'student') !== 'teacher') {
        showToast('رفع الفيديوهات متاح لحساب المعلمة فقط.', 'danger');
        return;
      }

      try {
        uploadBtn.disabled = true;
        progressArea.style.display = 'block';
        progressBar.style.width = '0%';
        statusText.textContent = 'جاري تجهيز الفيديو على سيرفر البث...';
        UploadFloat.show('جاري رفع الفيديو');
        UploadFloat.update(0, 'جاري تجهيز الفيديو على سيرفر البث...');

        // Step 1: reserve a slot on Bunny (title follows the lesson convention).
        const prepared = await fetchJson(`/api/lessons/${lessonId}/video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            title: videoName,
            attachmentUrl,
            description,
          }),
        });

        if (pdfFile) {
          await uploadSelectedMaterial((pct, statusMsg) => {
            progressBar.style.width = pct + '%';
            statusText.textContent =
              statusMsg || `جاري رفع ملف PDF الخاص بالدرس... ${pct}%`;
            UploadFloat.update(pct, statusMsg || `جاري رفع ملف PDF... ${pct}%`);
          });
          statusText.textContent = 'تم رفع الـ PDF ✔ — جاري رفع الفيديو...';
          progressBar.style.width = '0%';
        }

        // Step 2: PUT the raw file straight to Bunny with upload progress.
        if (swUploadAvailable) {
          // BACKGROUND PATH: the service worker owns the big video PUT, so
          // the teacher can browse other pages while it runs. Bunny encodes
          // server-side afterwards regardless of who is watching.
          const jobId = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;

          const outcome = await startSwUploadJob({
            id: jobId,
            kind: 'video',
            url: prepared.uploadUrl,
            method: 'PUT',
            headers: { AccessKey: prepared.accessKey },
            blob: file,
            meta: { lessonId, label: `فيديو: ${videoName}` },
            status: 'queued',
          });

          if (!outcome.ok) {
            const rawError = String(outcome.error || '');
            if (/failed to fetch|networkerror|load failed/i.test(rawError)) {
              throw new Error('انقطع الاتصال أثناء رفع الفيديو. تأكدي من الشبكة وحاولي مرة أخرى.');
            }
            throw new Error(outcome.error || 'فشل رفع الملف.');
          }
        } else {
          // INLINE FALLBACK (no service worker).
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', prepared.uploadUrl);
            xhr.setRequestHeader('AccessKey', prepared.accessKey);
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                progressBar.style.width = pct + '%';
                statusText.textContent = `جاري رفع الملف... ${pct}%`;
                UploadFloat.update(pct, `جاري رفع الملف... ${pct}%`);
              }
            });
            xhr.addEventListener('load', () =>
              xhr.status >= 200 && xhr.status < 300
                ? resolve()
                : reject(new Error(`فشل رفع الملف (${xhr.status}).`))
            );
            xhr.addEventListener('error', () =>
              reject(new Error('انقطع الاتصال أثناء الرفع.'))
            );
            xhr.send(file);
          });
        }

        statusText.textContent = 'تم الرفع! جاري معالجة الفيديو على Bunny...';

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
              { headers: authHeaders() }
            );
            pollFailures = 0;
            progressBar.style.width = Math.max(st.encodeProgress || 0, 5) + '%';
            UploadFloat.update(Math.max(st.encodeProgress || 0, 5), 'جاري معالجة الفيديو على Bunny...');

            if (st.ready) {
              clearInterval(poll);
              progressBar.style.width = '100%';
              statusText.textContent = 'الفيديو جاهز ✅ — تم الرفع بنجاح';
              showToast('تم رفع الفيديو بنجاح! الطلاب يستطيعون مشاهدته الآن.', 'success');
              UploadFloat.done('الفيديو جاهز ✅');
              uploadBtn.disabled = false;
            } else if ([5, 6].includes(st.status)) {
              clearInterval(poll);
              statusText.textContent = 'فشلت معالجة الفيديو على Bunny.';
              showToast('فشلت معالجة الفيديو، حاولي رفعه مرة أخرى.', 'danger');
              UploadFloat.fail('فشلت معالجة الفيديو.');
              uploadBtn.disabled = false;
            }
          } catch (pollError) {
            pollFailures += 1;
            if (pollFailures >= MAX_POLL_FAILURES) {
              clearInterval(poll);
              statusText.textContent =
                'انقطعت المراقبة أثناء معالجة الفيديو، لكن الملف مرفوع. حدّثي صفحة الدرس بعد قليل للتحقق.';
              showToast('فقدنا الاتصال بمراقبة المعالجة. الملف مرفوع على Bunny وسيظهر في الدرس عند جهوزه.', 'warning');
              UploadFloat.fail('انقطعت مراقبة المعالجة.');
              uploadBtn.disabled = false;
            } else {
              statusText.textContent =
                `تعذر التحقق مؤقتاً — سنعيد المحاولة (${pollFailures}/${MAX_POLL_FAILURES})...`;
            }
          }
        }, 5000);
      } catch (error) {
        showToast(error.message, 'danger');
        progressArea.style.display = 'none';
        UploadFloat.fail(error.message);
        uploadBtn.disabled = false;
      }
    });
  }

  // --- Front-end only chatbot demos ---
  const chatbotForms = document.querySelectorAll('.chatbot-form');
  const chatbotReplies = {
    ai: 'هذا رد تجريبي من مساعد المنهج. لاحقاً يمكن ربط هذا المكان بنموذج AI مع RAG على محتوى الدروس والملخصات.',
    teacher: 'تم حفظ رسالتك داخل الواجهة فقط. لاحقاً يمكن ربط هذه المحادثة برسائل المعلمة أو لوحة تحكم خاصة بها.'
  };

  const addChatMessage = (messagesBox, senderName, text, className) => {
    const message = document.createElement('div');
    message.className = `chat-message ${className}`;

    const name = document.createElement('span');
    name.className = 'chat-message-name';
    name.textContent = senderName;

    const body = document.createElement('p');
    body.textContent = text;

    message.append(name, body);
    messagesBox.appendChild(message);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  };

  chatbotForms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const chatbotType = form.dataset.chatbotForm;
      const input = form.querySelector('input[name="message"]');
      const messageText = input.value.trim();
      const messagesBox = document.querySelector(`[data-chatbot-messages="${chatbotType}"]`);

      if (!messageText || !messagesBox) return;

      addChatMessage(messagesBox, 'أنت', messageText, 'user-message');
      input.value = '';

      setTimeout(() => {
        const sender = chatbotType === 'teacher' ? 'أ. أسماء' : 'مساعد المنهج';
        addChatMessage(messagesBox, sender, chatbotReplies[chatbotType], chatbotType === 'teacher' ? 'bot-message teacher-message' : 'bot-message');
      }, 450);
    });
  });

  // --- Teacher dashboard: manage already-uploaded videos (edit / delete) ---
  const manageChapter = document.querySelector('#manage-chapter');
  const manageLesson = document.querySelector('#manage-lesson');

  if (manageChapter && manageLesson && window.CURRICULUM) {
    const fillManageLessons = (chapterIdx) => {
      const chapter = window.CURRICULUM.biology[chapterIdx];
      manageLesson.innerHTML = '';
      chapter.lessons.forEach((lesson) => {
        const opt = document.createElement('option');
        opt.value = lesson.id;
        opt.textContent = `${lesson.name} (${lesson.id})`;
        manageLesson.appendChild(opt);
      });
      // Also refresh the "move to lesson" dropdown in the edit form.
      const moveSelect = document.querySelector('#edit-move-lesson');
      if (moveSelect) {
        moveSelect.innerHTML = '<option value="">— إبقاء الدرس الحالي —</option>';
        window.CURRICULUM.biology.forEach((ch) => {
          ch.lessons.forEach((l) => {
            const o = document.createElement('option');
            o.value = l.id;
            o.textContent = `${ch.name.split(':')[0]} — ${l.name}`;
            moveSelect.appendChild(o);
          });
        });
      }
    };

    window.CURRICULUM.biology.forEach((chapter, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = chapter.name;
      manageChapter.appendChild(opt);
    });
    manageChapter.addEventListener('change', () =>
      fillManageLessons(Number(manageChapter.value))
    );
    fillManageLessons(0);

    const editForm = document.querySelector('#video-edit-form');
    const videosListBox = document.querySelector('#manage-videos-list');
    let loadedVideos = [];

    const renderManageList = () => {
      videosListBox.innerHTML = '';

      if (!loadedVideos.length) {
        videosListBox.innerHTML =
          '<p class="text-muted" style="margin:0;">لا توجد فيديوهات مرفوعة لهذا الدرس بعد.</p>';
        return;
      }

      loadedVideos.forEach((v, idx) => {
        const row = document.createElement('div');
        row.style.cssText =
          'display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center; padding:0.9rem; border:1px solid var(--color-primary-light); border-radius:var(--radius-md); margin-bottom:0.75rem;';

        const info = document.createElement('div');
        info.style.cssText = 'flex:1; min-width:200px;';
        info.innerHTML =
          `<div style="font-weight:700;">${idx + 1}. ${v.name || '(بدون اسم)'}</div>` +
          `<div class="text-muted" style="font-size:0.8rem;">` +
          `${v.ready ? `⏱ ${Math.max(1, Math.round(v.lengthSeconds / 60))} دقيقة` : '⏳ قيد المعالجة'}` +
          `${v.description ? ` • ${v.description.slice(0, 60)}` : ''}</div>`;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; gap:0.5rem;';
        actions.innerHTML =
          '<button class="btn btn-light js-edit-video" style="font-size:0.8rem;">✏️ تعديل</button>' +
          '<button class="btn btn-light js-delete-video" style="font-size:0.8rem; color:var(--color-danger);">🗑 حذف</button>';

        row.append(info, actions);

        row.querySelector('.js-edit-video').addEventListener('click', () => {
          document.querySelector('#edit-video-id').value = v.videoId;
          document.querySelector('#edit-name').value = v.name || '';
          document.querySelector('#edit-attachment').value = v.attachmentUrl || '';
          document.querySelector('#edit-description').value = v.description || '';
          document.querySelector('#edit-move-lesson').value = '';
          editForm.style.display = 'block';
          editForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        row.querySelector('.js-delete-video').addEventListener('click', async () => {
          if (!confirm(`حذف الفيديو "${v.name || idx + 1}" نهائياً من Bunny؟ لا يمكن التراجع.`)) return;
          try {
            await fetchJson(`/api/videos/${v.videoId}`, {
              method: 'DELETE',
              headers: authHeaders(),
            });
            showToast('تم حذف الفيديو بنجاح.', 'success');
            loadVideosList();
          } catch (error) {
            showToast(error.message, 'danger');
          }
        });

        videosListBox.appendChild(row);
      });
    };

    const loadVideosList = async () => {
      const lessonId = manageLesson.value;
      try {
        videosListBox.innerHTML =
          '<p class="text-muted" style="margin:0;">جاري التحميل...</p>';
        const data = await fetchJson(
          `/api/lessons/${lessonId}/videos`,
          { headers: authHeaders() }
        );
        loadedVideos = data.videos || [];
        renderManageList();
      } catch (error) {
        loadedVideos = [];
        videosListBox.innerHTML = '';
        showToast(error.message, 'danger');
      }
    };

    document
      .querySelector('#btn-load-videos')
      .addEventListener('click', loadVideosList);

    document.querySelector('#btn-cancel-edit').addEventListener('click', () => {
      editForm.style.display = 'none';
    });

    document.querySelector('#btn-save-edit').addEventListener('click', async () => {
      const videoId = document.querySelector('#edit-video-id').value;
      const body = {
        name: document.querySelector('#edit-name').value,
        attachmentUrl: document.querySelector('#edit-attachment').value,
        description: document.querySelector('#edit-description').value,
      };
      const moveTo = document.querySelector('#edit-move-lesson').value;
      if (moveTo) body.lessonId = moveTo;

      try {
        await fetchJson(`/api/videos/${videoId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify(body),
        });
        showToast('تم حفظ التعديلات بنجاح.', 'success');
        editForm.style.display = 'none';
        loadVideosList();
      } catch (error) {
        showToast(error.message, 'danger');
      }
    });
  }

  // --- Teacher dashboard: manage lesson PDF materials (rename / delete) ---
  // Mirrors the video management block above: same selects pattern, same
  // inline edit form, same native confirm() before deleting.
  const materialsManageChapter = document.querySelector('#materials-manage-chapter');
  const materialsManageLesson = document.querySelector('#materials-manage-lesson');

  if (materialsManageChapter && materialsManageLesson && window.CURRICULUM) {
    // Auth uses the shared JWT helper — the backend enforces the teacher role.

    /** Fills the lesson dropdown for the chosen chapter. */
    const fillMaterialsManageLessons = (chapterIdx) => {
      const chapter = window.CURRICULUM.biology[chapterIdx];
      materialsManageLesson.innerHTML = '';
      chapter.lessons.forEach((lesson) => {
        const opt = document.createElement('option');
        opt.value = lesson.id;
        opt.textContent = `${lesson.name} (${lesson.id})`;
        materialsManageLesson.appendChild(opt);
      });
    };

    window.CURRICULUM.biology.forEach((chapter, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = chapter.name;
      materialsManageChapter.appendChild(opt);
    });
    materialsManageChapter.addEventListener('change', () =>
      fillMaterialsManageLessons(Number(materialsManageChapter.value))
    );
    fillMaterialsManageLessons(0);

    const materialEditForm = document.querySelector('#material-edit-form');
    const materialsListBox = document.querySelector('#manage-materials-list');
    let loadedMaterials = [];

    /** Formats a byte count for the management list ("812 KB" / "1.4 MB"). */
    const formatMaterialSize = (sizeBytes) => {
      if (!sizeBytes) return '';
      if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
      return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    /** Formats an ISO date as a short readable date for the list rows. */
    const formatMaterialDate = (isoDate) => {
      if (!isoDate) return '';
      try {
        return new Date(isoDate).toLocaleDateString('ar-EG');
      } catch (error) {
        return '';
      }
    };

    const renderMaterialsManageList = () => {
      materialsListBox.innerHTML = '';

      if (!loadedMaterials.length) {
        materialsListBox.innerHTML =
          '<p class="text-muted" style="margin:0;">لا توجد ملفات PDF مرفوعة لهذا الدرس بعد.</p>';
        return;
      }

      loadedMaterials.forEach((material, idx) => {
        const row = document.createElement('div');
        row.style.cssText =
          'display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center; padding:0.9rem; border:1px solid var(--color-primary-light); border-radius:var(--radius-md); margin-bottom:0.75rem;';

        const info = document.createElement('div');
        info.style.cssText = 'flex:1; min-width:200px;';
        const metaParts = [
          formatMaterialDate(material.createdAt),
          formatMaterialSize(material.sizeBytes),
        ].filter(Boolean).join(' • ');
        info.innerHTML =
          `<div style="font-weight:700;">${idx + 1}. ${material.title || '(بدون اسم)'}</div>` +
          `<div class="text-muted" style="font-size:0.8rem;">📄 PDF${metaParts ? ` • ${metaParts}` : ''}</div>`;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; gap:0.5rem;';
        actions.innerHTML =
          '<button class="btn btn-light js-edit-material" style="font-size:0.8rem;">✏️ تعديل</button>' +
          '<button class="btn btn-light js-delete-material" style="font-size:0.8rem; color:var(--color-danger);">🗑 حذف</button>';

        row.append(info, actions);

        row.querySelector('.js-edit-material').addEventListener('click', () => {
          document.querySelector('#edit-material-id').value = material.id;
          document.querySelector('#edit-material-title').value = material.title || '';
          materialEditForm.style.display = 'block';
          materialEditForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        row.querySelector('.js-delete-material').addEventListener('click', async () => {
          if (!confirm(`حذف هذه المادة "${material.title || idx + 1}" نهائياً؟ لا يمكن التراجع.`)) return;
          try {
            await fetchJson(`/api/materials/${encodeURIComponent(material.id)}`, {
              method: 'DELETE',
              headers: authHeaders(),
            });
            showToast('تم حذف المادة بنجاح.', 'success');
            loadMaterialsManageList();
          } catch (error) {
            showToast(error.message, 'danger');
          }
        });

        materialsListBox.appendChild(row);
      });
    };

    const loadMaterialsManageList = async () => {
      const lessonId = materialsManageLesson.value;
      if (!lessonId) return;
      try {
        materialsListBox.innerHTML =
          '<p class="text-muted" style="margin:0;">جاري التحميل...</p>';
        const data = await fetchJson(
          `/api/lessons/${lessonId}/materials/manage`,
          { headers: authHeaders() }
        );
        loadedMaterials = data.materials || [];
        renderMaterialsManageList();
      } catch (error) {
        loadedMaterials = [];
        materialsListBox.innerHTML = '';
        showToast(error.message, 'danger');
      }
    };

    document
      .querySelector('#btn-load-materials')
      .addEventListener('click', loadMaterialsManageList);

    document.querySelector('#btn-cancel-material-edit').addEventListener('click', () => {
      materialEditForm.style.display = 'none';
    });

    document.querySelector('#btn-save-material-edit').addEventListener('click', async () => {
      const materialId = document.querySelector('#edit-material-id').value;
      const newTitle = document.querySelector('#edit-material-title').value;

      if (!newTitle.trim()) {
        showToast('اكتبي اسم المادة أولاً.', 'warning');
        return;
      }

      try {
        await fetchJson(`/api/materials/${encodeURIComponent(materialId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({ title: newTitle }),
        });
        showToast('تم حفظ التعديلات بنجاح.', 'success');
        materialEditForm.style.display = 'none';
        loadMaterialsManageList();
      } catch (error) {
        showToast(error.message, 'danger');
      }
    });
  }
});

