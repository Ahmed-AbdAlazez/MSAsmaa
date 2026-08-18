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
          <button class="btn btn-danger btn-full" id="mobile-logout-btn">تسجيل الخروج (${username})</button>
        `;
      }
    } else {
      // User is logged out
      if (navAuthContainer) {
        navAuthContainer.innerHTML = `
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
    const authBtn = document.querySelector('#auth-action-btn');
    if (authBtn) {
      authBtn.addEventListener('click', handleAuthAction);
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
        if (drawer) drawer.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
      });
    }
  };

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

