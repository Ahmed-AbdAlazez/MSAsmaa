/**
 * Shared Navbar Component
 * Dynamically builds and injects the unified navbar and mobile drawer across all pages.
 */

export function initNavbar() {
  const navbarElement = document.querySelector('.navbar');
  if (!navbarElement) return;

  // Clean the navbar class list to ensure it's not restricted by .container
  navbarElement.className = 'navbar';

  const currentPath = window.location.pathname;
  const userRole = localStorage.getItem('userRole');
  const isTeacher = userRole === 'teacher';
  const isStudent = userRole === 'student';

  // Helper to determine active state of nav links
  const getActive = (paths) => {
    const isMatch = paths.some(path => {
      if (path === 'index.html') {
        return currentPath === '/' || currentPath.endsWith('index.html') || currentPath === '';
      }
      return currentPath.includes(path);
    });
    return isMatch ? 'active' : '';
  };

  // Build dashboard link based on role
  let dashboardLink = '';
  let mobileDashboardLink = '';
  if (isTeacher) {
    dashboardLink = `<li><a href="dashboard-teacher.html" class="nav-link ${getActive(['dashboard-teacher.html'])}">لوحة المعلمة</a></li>`;
    mobileDashboardLink = `<li><a href="dashboard-teacher.html" class="mobile-link ${getActive(['dashboard-teacher.html'])}">لوحة المعلمة</a></li>`;
  } else if (isStudent) {
    dashboardLink = `<li><a href="dashboard-student.html" class="nav-link ${getActive(['dashboard-student.html'])}">لوحة الطالب</a></li>`;
    mobileDashboardLink = `<li><a href="dashboard-student.html" class="mobile-link ${getActive(['dashboard-student.html'])}">لوحة الطالب</a></li>`;
  }

  // Generate navbar inner HTML
  navbarElement.innerHTML = `
    <div class="container">
      <a href="index.html" class="brand">
        <span class="brand-icon">🧬</span>
        <span>المرسال</span>
      </a>
      <ul class="nav-links">
        <li><a href="index.html" class="nav-link ${getActive(['index.html'])}">الرئيسية</a></li>
        <li><a href="course-biology.html" class="nav-link ${getActive(['course-biology.html', 'lessons.html', 'lesson-view.html'])}">الأحياء (3ث)</a></li>
        <li><a href="exams.html" class="nav-link ${getActive(['exams.html'])}">الاختبارات</a></li>
        <li><a href="assignments.html" class="nav-link ${getActive(['assignments.html', 'assignment-view.html'])}">الواجبات</a></li>
        <li><a href="chatbots.html" class="nav-link ${getActive(['chatbots.html'])}">المحادثات</a></li>
        ${dashboardLink}
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
  let overlay = document.querySelector('.drawer-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    document.body.appendChild(overlay);
  }

  let drawer = document.querySelector('.mobile-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.className = 'mobile-drawer';
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
      <li><a href="index.html" class="mobile-link ${getActive(['index.html'])}">الرئيسية</a></li>
      <li><a href="course-biology.html" class="mobile-link ${getActive(['course-biology.html', 'lessons.html', 'lesson-view.html'])}">الأحياء (3ث)</a></li>
      <li><a href="exams.html" class="mobile-link ${getActive(['exams.html'])}">الاختبارات</a></li>
      <li><a href="assignments.html" class="mobile-link ${getActive(['assignments.html', 'assignment-view.html'])}">الواجبات</a></li>
      <li><a href="chatbots.html" class="mobile-link ${getActive(['chatbots.html'])}">المحادثات</a></li>
      ${mobileDashboardLink}
    </ul>
    <div class="mobile-auth-container" style="padding: 1rem 0;"></div>
  `;
}
