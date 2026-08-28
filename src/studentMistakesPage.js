const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const formatDate = (value) => new Intl.DateTimeFormat('ar-EG', {
  year: 'numeric', month: 'long', day: 'numeric',
}).format(new Date(value));

export function initStudentMistakesPage({ API_BASE, authHeaders, fetchJson, showToast }) {
  const root = document.querySelector('#student-mistakes-page');
  if (!root) return;
  if (String(localStorage.getItem('userRole') || '').toLowerCase() !== 'student' || !localStorage.getItem('token')) {
    window.location.replace('login.html');
    return;
  }
  const list = root.querySelector('#student-mistakes-list');
  const pagination = root.querySelector('#student-mistakes-pagination');
  let page = 1;
  const render = (mistakes) => {
    list.innerHTML = mistakes.length ? mistakes.map((mistake) => `
      <article class="mistake-card">
        <p class="mistake-exam">الاختبار: <strong>${escapeHtml(mistake.quizTitle)}</strong></p>
        <h2>${escapeHtml(mistake.questionText)}</h2>
        <div class="mistake-answer wrong"><span>❌ إجابتك</span><strong>${escapeHtml(mistake.studentAnswer || 'لم تتم الإجابة')}</strong></div>
        <div class="mistake-answer correct"><span>✅ الإجابة الصحيحة</span><strong>${escapeHtml(mistake.correctAnswer)}</strong></div>
        <time datetime="${escapeHtml(mistake.createdAt)}">${escapeHtml(formatDate(mistake.createdAt))}</time>
      </article>`).join('') : '<div class="mistakes-empty">ممتاز! لا توجد أخطاء حتى الآن 🎉</div>';
  };
  const renderPagination = (info) => {
    if (info.totalPages <= 1) { pagination.innerHTML = ''; return; }
    pagination.innerHTML = `<button class="btn btn-secondary" type="button" ${page <= 1 ? 'disabled' : ''}>السابق</button><span>صفحة ${info.page} من ${info.totalPages}</span><button class="btn btn-secondary" type="button" ${page >= info.totalPages ? 'disabled' : ''}>التالي</button>`;
    const [previous, next] = pagination.querySelectorAll('button');
    previous.addEventListener('click', () => { page -= 1; load(); });
    next.addEventListener('click', () => { page += 1; load(); });
  };
  const load = async () => {
    list.innerHTML = '<p class="text-muted">جارٍ تحميل أخطائك...</p>';
    pagination.innerHTML = '';
    try {
      const data = await fetchJson(`${API_BASE}/student/mistakes?page=${page}&limit=20`, { headers: authHeaders() });
      render(data?.data?.mistakes || []);
      renderPagination(data?.data?.pagination || { page: 1, totalPages: 0 });
    } catch (_) {
      list.innerHTML = '<p class="text-muted">تعذر تحميل الأخطاء الآن. حاولي مرة أخرى.</p>';
      showToast('تعذر تحميل الأخطاء الآن. حاولي مرة أخرى.', 'danger');
    }
  };
  load();
}
