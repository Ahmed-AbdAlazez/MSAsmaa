document.addEventListener('DOMContentLoaded', () => {
  // --- Demo accounts for testing ---
  const DEMO_ACCOUNTS = {
    student: { username: 'student', password: '123456', displayName: 'أحمد محمد', role: 'student' },
    teacher: { username: 'teacher', password: '123456', displayName: 'أ. أسماء مرسال', role: 'teacher' }
  };

  const findAccount = (username, password) => {
    const key = username.trim().toLowerCase();
    return Object.values(DEMO_ACCOUNTS).find(
      (acc) => acc.username === key && acc.password === password
    );
  };

  const openLoginModal = () => {
    document.querySelector('#login-modal-backdrop')?.classList.add('show');
  };

  document.addEventListener('click', (event) => {
    const loginTrigger = event.target.closest('.js-login-trigger');
    if (!loginTrigger) return;

    event.preventDefault();
    openLoginModal();
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
   // --- Dynamic Client-Side Auth Modal & Login Icon Logic ---
  
  // Inject Login Modal HTML on load if not already present
  if (!document.querySelector('#login-modal-backdrop')) {
    const loginModalHTML = `
      <div id="login-modal-backdrop" class="welcome-modal-backdrop">
        <div class="welcome-modal">
          <button id="login-modal-close" class="modal-close-btn">✕</button>
          <div class="welcome-modal-logo">🔐</div>
          <h2 id="auth-modal-title">تسجيل الدخول</h2>
          <p id="auth-modal-description" class="auth-modal-description">استخدم بريد Gmail وكلمة المرور للوصول إلى حسابك.</p>
          <div class="auth-mode-switch" role="tablist" aria-label="خيارات الحساب">
            <button type="button" class="auth-mode-btn active" data-auth-mode="signin"><span aria-hidden="true">↪</span> تسجيل الدخول</button>
            <button type="button" class="auth-mode-btn" data-auth-mode="signup"><span aria-hidden="true">✚</span> إنشاء حساب</button>
          </div>
          <form id="login-modal-form" novalidate>
            <div class="form-group" style="margin-bottom: 1rem; text-align: right;">
              <label style="display: block; margin-bottom: 0.5rem; font-weight: 700;">نوع الحساب</label>
              <select id="login-role" class="form-input" style="width: 100%;">
                <option value="student">👨‍🎓 طالب (لوحة الطالب)</option>
                <option value="teacher">👩‍🏫 معلمة أحياء (أ. أسماء مرسال)</option>
              </select>
            </div>
            <div class="form-group" id="auth-name-group" style="margin-bottom: 1rem; text-align: right;" hidden>
              <label for="login-username" style="display: block; margin-bottom: 0.5rem; font-weight: 700;">الاسم</label>
              <div class="auth-input-wrap"><span class="auth-input-icon" aria-hidden="true">👤</span><input type="text" id="login-username" class="form-input" placeholder="اكتب اسمك" style="width: 100%;"></div>
            </div>
            <div class="form-group" style="margin-bottom: 1.5rem; text-align: right;">
              <label for="login-email" style="display: block; margin-bottom: 0.5rem; font-weight: 700;">بريد Gmail الإلكتروني</label>
              <div class="auth-input-wrap"><span class="auth-input-icon" aria-hidden="true">✉</span><input type="email" id="login-email" class="form-input" placeholder="name@gmail.com" autocomplete="email" required pattern="[a-zA-Z0-9._%+-]+@gmail\\.com" style="width: 100%;"></div>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem; text-align: right;">
              <label for="login-password" style="display: block; margin-bottom: 0.5rem; font-weight: 700;">كلمة المرور</label>
              <div class="auth-input-wrap"><span class="auth-input-icon" aria-hidden="true">🔒</span><input type="password" id="login-password" class="form-input" placeholder="••••••••" autocomplete="current-password" required style="width: 100%;"><button type="button" class="password-toggle" aria-label="إظهار كلمة المرور" title="إظهار كلمة المرور">◉</button></div>
            </div>
            <p id="password-requirements" class="password-requirements" hidden>يجب أن تحتوي على حرف كبير وحرف صغير ورقم واحد على الأقل.</p>
            <button type="submit" id="auth-submit-btn" class="btn btn-primary btn-full" style="padding: 0.8rem;"><span aria-hidden="true">↪</span> تسجيل الدخول</button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', loginModalHTML);
  }

  const loginModal = document.querySelector('#login-modal-backdrop');
  const loginForm = document.querySelector('#login-modal-form');
  const loginClose = document.querySelector('#login-modal-close');
  const authModeButtons = document.querySelectorAll('.auth-mode-btn');
  const authNameGroup = document.querySelector('#auth-name-group');
  const passwordRequirements = document.querySelector('#password-requirements');
  const authSubmitButton = document.querySelector('#auth-submit-btn');
  const loginEmail = document.querySelector('#login-email');
  const loginPassword = document.querySelector('#login-password');
  let authMode = 'signin';

  const isGmailAddress = (email) => /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email);
  const isStrongPassword = (password) => /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
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

  const getNotifications = () => getStoredItems(NOTIFICATIONS_STORAGE_KEY, [
    {
      id: 'notify-welcome',
      title: 'اختبار جديد متاح',
      message: 'تم إضافة اختبار سريع في الوراثة الجزيئية.',
      type: 'quiz',
      read: false
    }
  ]);

  const addNotification = (title, message, type = 'news') => {
    const notifications = getNotifications();
    notifications.unshift({
      id: `notify-${Date.now()}`,
      title,
      message,
      type,
      read: false
    });
    setStoredItems(NOTIFICATIONS_STORAGE_KEY, notifications);
    updateNotificationBadge();
  };

  const updateNotificationBadge = () => {
    const unreadCount = getNotifications().filter((item) => !item.read).length;
    document.querySelectorAll('.notification-count').forEach((badge) => {
      badge.textContent = unreadCount;
      badge.hidden = unreadCount === 0;
    });
  };

  const renderNotificationsMenu = () => {
    const notifications = getNotifications();
    const list = document.querySelector('#notification-list');
    if (!list) return;

    if (!notifications.length) {
      list.innerHTML = '<div class="notification-empty">لا توجد إشعارات جديدة الآن.</div>';
      return;
    }

    list.innerHTML = notifications.slice(0, 6).map((item) => `
      <div class="notification-item ${item.read ? '' : 'unread'}">
        <div class="notification-item-icon">${item.type === 'quiz' ? '؟' : '!'}</div>
        <div>
          <h4>${item.title}</h4>
          <p>${item.message}</p>
        </div>
      </div>
    `).join('');
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
        addNotification('اختبار جديد من أ. أسماء', `${quiz.title} متاح الآن للطلاب.`, 'quiz');
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

  const setAuthMode = (mode) => {
    authMode = mode;
    const isSignUp = mode === 'signup';
    document.querySelector('#auth-modal-title').textContent = isSignUp ? 'إنشاء حساب' : 'تسجيل الدخول';
    document.querySelector('#auth-modal-description').textContent = isSignUp
      ? 'أنشئ حساباً باستخدام بريد Gmail وكلمة مرور آمنة.'
      : 'استخدم بريد Gmail وكلمة المرور للوصول إلى حسابك.';
    authNameGroup.hidden = !isSignUp;
    document.querySelector('#login-username').required = isSignUp;
    passwordRequirements.hidden = !isSignUp;
    loginPassword.autocomplete = isSignUp ? 'new-password' : 'current-password';
    authSubmitButton.innerHTML = isSignUp ? '<span aria-hidden="true">✚</span> إنشاء حساب' : '<span aria-hidden="true">↪</span> تسجيل الدخول';
    authModeButtons.forEach((button) => button.classList.toggle('active', button.dataset.authMode === mode));
  };

  authModeButtons.forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
  document.querySelector('.password-toggle')?.addEventListener('click', (event) => {
    const willShowPassword = loginPassword.type === 'password';
    loginPassword.type = willShowPassword ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-label', willShowPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    event.currentTarget.setAttribute('title', willShowPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    event.currentTarget.textContent = willShowPassword ? '◉' : '◌';
  });

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
      notificationBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        renderNotificationsMenu();
        notificationMenu.classList.toggle('show');
      });
    }

    const markNotificationsRead = document.querySelector('#mark-notifications-read');
    if (markNotificationsRead) {
      markNotificationsRead.addEventListener('click', () => {
        const notifications = getNotifications().map((item) => ({ ...item, read: true }));
        setStoredItems(NOTIFICATIONS_STORAGE_KEY, notifications);
        renderNotificationsMenu();
        updateNotificationBadge();
      });
    }

    const mobileNotificationsBtn = document.querySelector('#mobile-notifications-btn');
    if (mobileNotificationsBtn) {
      mobileNotificationsBtn.addEventListener('click', () => {
        const latestNotification = getNotifications()[0];
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
        if (loginModal) loginModal.classList.add('show');
        // Close mobile drawer if open
        const drawer = document.querySelector('.mobile-drawer');
        const overlay = document.querySelector('.drawer-overlay');
        if (drawer) drawer.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
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
      if (loginModal) loginModal.classList.add('show');
    }
  };

  const handleLogout = () => {
    if (confirm('هل تريد بالتأكيد تسجيل الخروج من الحساب؟')) {
      localStorage.removeItem('userRole');
      localStorage.removeItem('username');
      showToast('تم تسجيل الخروج بنجاح. نتمنى رؤيتك قريباً! 👋', 'success');
      updateAuthUI();
      // Redirect to index page
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 800);
    }
  };

  // Close login modal handlers
  if (loginClose) {
    loginClose.addEventListener('click', () => {
      if (loginModal) loginModal.classList.remove('show');
    });
  }

  // Close modal when clicking backdrop
  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) {
        loginModal.classList.remove('show');
      }
    });
  }

  // Handle Login submission
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const role = document.querySelector('#login-role').value;
      const usernameInput = document.querySelector('#login-username').value.trim();
      const email = loginEmail.value.trim().toLowerCase();
      const password = loginPassword.value;

      if (!isGmailAddress(email)) {
        showToast('يرجى إدخال بريد إلكتروني صحيح ينتهي بـ @gmail.com.', 'warning');
        loginEmail.focus();
        return;
      }

      if (!isStrongPassword(password)) {
        showToast('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم واحد على الأقل.', 'warning');
        loginPassword.focus();
        return;
      }

      const savedAccounts = JSON.parse(localStorage.getItem('frontEndAccounts') || '{}');
      if (authMode === 'signup') {
        if (!usernameInput) {
          showToast('يرجى إدخال الاسم لإنشاء الحساب.', 'warning');
          return;
        }
        if (savedAccounts[email]) {
          showToast('يوجد حساب مسجل بهذا البريد الإلكتروني. سجّل الدخول بدلاً من ذلك.', 'warning');
          setAuthMode('signin');
          return;
        }
        savedAccounts[email] = { name: usernameInput, password, role };
        localStorage.setItem('frontEndAccounts', JSON.stringify(savedAccounts));
      } else if (savedAccounts[email] && savedAccounts[email].password !== password) {
        showToast('كلمة المرور غير صحيحة لهذا البريد الإلكتروني.', 'danger');
        loginPassword.focus();
        return;
      }

      const displayName = authMode === 'signup' ? usernameInput : (savedAccounts[email]?.name || email.split('@')[0]);

      localStorage.setItem('userRole', role);
      localStorage.setItem('username', displayName);

      if (loginModal) loginModal.classList.remove('show');
      
      showToast(`مرحباً بك يا ${displayName}! تم ${authMode === 'signup' ? 'إنشاء الحساب' : 'تسجيل الدخول'} بنجاح. 🎉`, 'success');
      updateAuthUI();

      // Redirect depending on role
      setTimeout(() => {
        if (role === 'teacher') {
          window.location.href = 'dashboard-teacher.html';
        } else {
          window.location.href = 'dashboard-student.html';
        }
      }, 1000);
    });
  }

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
});

