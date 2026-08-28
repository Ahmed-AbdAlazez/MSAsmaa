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
        ${mobileRegistrationRequestsLink}
        ${mobileStudentsManagementLink}
      </ul>
      <div class="mobile-auth-container" style="padding: 1rem 0;"></div>
    `;
  }
}
