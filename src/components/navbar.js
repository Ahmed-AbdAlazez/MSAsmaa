/**
 * Shared Navbar Component
 * Dynamically builds and injects the unified navbar and mobile drawer across all pages.
 * Conditionally renders MINIMAL navbar for logged-out users and FULL navbar for logged-in users.
 */

export function initNavbar() {
  const navbarElement = document.querySelector(".navbar");
  if (!navbarElement) return;

  // Clean the navbar class list to ensure it's not restricted by .container
  navbarElement.className = "navbar";

  const currentPath = window.location.pathname;
  const token = localStorage.getItem("token");
  const userRole = localStorage.getItem("userRole");
  const isLoggedIn = !!token;
  const isTeacher = userRole === "teacher";
  const isStudent = userRole === "student";

  // --- Floating WhatsApp support button (login-only, site-wide widget) ---
  // Created once and shown/hidden based on the SAME auth state used by the
  // navbar above. initNavbar re-runs on every auth change (initial load plus
  // login/logout), so the button appears right after login and disappears
  // right after logout without any page refresh.
  {
    let waBtn = document.querySelector(".whatsapp-float");
    if (!waBtn) {
      waBtn = document.createElement("a");
      waBtn.className = "whatsapp-float";
      waBtn.href = "https://wa.me/201014125617";
      waBtn.target = "_blank";
      waBtn.rel = "noopener noreferrer";
      waBtn.setAttribute("aria-label", "تواصل معنا عبر واتساب");
      waBtn.title = "تواصل معنا عبر واتساب";
      waBtn.innerHTML =
        '<svg viewBox="0 0 448 512" aria-hidden="true">' +
        '<path d="' +
        'M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 ' +
        '0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 ' +
        '27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 ' +
        '341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5' +
        '-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 ' +
        '19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6' +
        '-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8' +
        '-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3' +
        '-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4' +
        '-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2' +
        '-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 ' +
        '19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 ' +
        '66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3' +
        '-2.5-5-3.9-10.5-6.6z"' +
        '/></svg>';
      document.body.appendChild(waBtn);
    }
    waBtn.style.display = isLoggedIn ? "flex" : "none";
  }

  // Helper to determine active state of nav links
  const getActive = (paths) => {
    const isMatch = paths.some((path) => {
      if (path === "index.html") {
        return (
          currentPath === "/" ||
          currentPath.endsWith("index.html") ||
          currentPath === ""
        );
      }
      return currentPath.includes(path);
    });
    return isMatch ? "active" : "";
  };

  if (!isLoggedIn) {
    // LOGGED OUT STATE: Show minimal navbar with only logo, dark mode toggle, and login/signup buttons
    navbarElement.innerHTML = `
      <div class="container">
        <a href="index.html" class="brand">
          <span class="brand-icon">🧬</span>
          <span>المرسال</span>
        </a>
        <div class="nav-actions">
          <button class="theme-toggle" type="button" aria-label="تبديل الوضع الليلي" title="تبديل الوضع الليلي/النهاري">
            <span class="ti-sun">☀️</span><span class="ti-moon">🌙</span>
          </button>
          <a href="login.html" class="btn-login-minimal">تسجيل الدخول</a>
          <a href="login.html?mode=signup" class="btn-signup-minimal">حساب جديد</a>
          <button class="nav-toggle" aria-label="فتح القائمة">☰</button>
        </div>
      </div>
    `;

    // Mobile drawer for logged-out state
    let overlay = document.querySelector(".drawer-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "drawer-overlay";
      document.body.appendChild(overlay);
    }

    let drawer = document.querySelector(".mobile-drawer");
    if (!drawer) {
      drawer = document.createElement("div");
      drawer.className = "mobile-drawer";
      document.body.appendChild(drawer);
    }

    drawer.innerHTML = `
      <div class="mobile-drawer-header">
        <div class="brand">
          <span class="brand-icon">🧬</span>
          <span>المرسال</span>
        </div>
        <button class="theme-toggle" type="button" aria-label="تبديل الوضع الليلي" title="تبديل الوضع الليلي/النهاري">
          <span class="ti-sun">☀️</span><span class="ti-moon">🌙</span>
        </button>
        <button class="mobile-drawer-close">✕</button>
      </div>
      <div class="mobile-auth-minimal" style="padding: 1rem 0;">
        <a href="login.html" class="btn btn-primary btn-full">تسجيل الدخول</a>
        <a href="login.html?mode=signup" class="btn btn-light btn-full">حساب جديد</a>
      </div>
    `;
  } else {
    // LOGGED IN STATE: Show full navbar with all navigation links

    // Build dashboard link based on role (teacher only)
    let dashboardLink = "";
    let mobileDashboardLink = "";
    if (isTeacher) {
      dashboardLink = `<li><a href="dashboard-teacher.html" class="nav-link ${getActive(["dashboard-teacher.html"])}">لوحة المعلمة</a></li>`;
      mobileDashboardLink = `<li><a href="dashboard-teacher.html" class="mobile-link ${getActive(["dashboard-teacher.html"])}">لوحة المعلمة</a></li>`;
    }

    const registrationRequestsLink = isTeacher
      ? `<li><a href="registration-requests.html" class="nav-link ${getActive(["registration-requests.html"])}">طلبات التسجيل</a></li>`
      : "";
    const mobileRegistrationRequestsLink = isTeacher
      ? `<li><a href="registration-requests.html" class="mobile-link ${getActive(["registration-requests.html"])}">طلبات التسجيل</a></li>`
      : "";
    const studentsManagementLink = isTeacher
      ? `<li><a href="students.html" class="nav-link ${getActive(["students.html"])}">الطلاب</a></li>`
      : "";
    const mobileStudentsManagementLink = isTeacher
      ? `<li><a href="students.html" class="mobile-link ${getActive(["students.html"])}">الطلاب</a></li>`
      : "";

    const mistakesLink = isStudent
      ? `<li><a href="student-mistakes.html" class="nav-link ${getActive(["student-mistakes.html"])}">&#x623;&#x62E;&#x637;&#x627;&#x626;&#x64A; / My Mistakes</a></li>`
      : "";
    const mobileMistakesLink = isStudent
      ? `<li><a href="student-mistakes.html" class="mobile-link ${getActive(["student-mistakes.html"])}">&#x623;&#x62E;&#x637;&#x627;&#x626;&#x64A; / My Mistakes</a></li>`
      : "";

    // Generate navbar inner HTML
    navbarElement.innerHTML = `
      <div class="container">
        <a href="index.html" class="brand">
          <span class="brand-icon">🧬</span>
          <span>المرسال</span>
        </a>
        <ul class="nav-links">
          <li><a href="index.html" class="nav-link ${getActive(["index.html"])}">الرئيسية</a></li>
          <li><a href="courses.html" class="nav-link ${getActive(["courses.html", "course-biology.html", "lessons.html", "lesson-view.html"])}">الكورسات</a></li>
          <li><a href="exams.html" class="nav-link ${getActive(["exams.html"])}">الاختبارات</a></li>
          ${dashboardLink}
          ${mistakesLink}
          ${registrationRequestsLink}
          ${studentsManagementLink}
        </ul>
        <div class="nav-actions">
          <button class="theme-toggle" type="button" aria-label="تبديل الوضع الليلي" title="تبديل الوضع الليلي/النهاري">
            <span class="ti-sun">☀️</span><span class="ti-moon">🌙</span>
          </button>
          <div class="nav-auth-container"></div>
          <button class="nav-toggle" aria-label="فتح القائمة">☰</button>
        </div>
      </div>
    `;

    // Inject Mobile Drawer Overlay & Sidebar if they are not already in the DOM
    let overlay = document.querySelector(".drawer-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "drawer-overlay";
      document.body.appendChild(overlay);
    }

    let drawer = document.querySelector(".mobile-drawer");
    if (!drawer) {
      drawer = document.createElement("div");
      drawer.className = "mobile-drawer";
      document.body.appendChild(drawer);
    }

    drawer.innerHTML = `
      <div class="mobile-drawer-header">
        <div class="brand">
          <span class="brand-icon">🧬</span>
          <span>المرسال</span>
        </div>
        <button class="theme-toggle" type="button" aria-label="تبديل الوضع الليلي" title="تبديل الوضع الليلي/النهاري">
          <span class="ti-sun">☀️</span><span class="ti-moon">🌙</span>
        </button>
        <button class="mobile-drawer-close">✕</button>
      </div>
      <ul class="mobile-links">
        <li><a href="index.html" class="mobile-link ${getActive(["index.html"])}">الرئيسية</a></li>
        <li><a href="courses.html" class="mobile-link ${getActive(["courses.html", "course-biology.html", "lessons.html", "lesson-view.html"])}">الكورسات</a></li>
        <li><a href="exams.html" class="mobile-link ${getActive(["exams.html"])}">الاختبارات</a></li>
        ${mobileDashboardLink}
        ${mobileMistakesLink}
        ${mobileRegistrationRequestsLink}
        ${mobileStudentsManagementLink}
      </ul>
      <div class="mobile-auth-container" style="padding: 1rem 0;"></div>
    `;
  }
}
