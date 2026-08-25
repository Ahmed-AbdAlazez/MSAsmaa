const API_BASE = import.meta.env.VITE_API_URL;

function showToast(message, type = 'success') {
  if (typeof window.showToast === 'function') return window.showToast(message, type);
  console.log(`[toast:${type}] ${message}`);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgot-password-form');
  const emailInput = document.getElementById('forgot-email');
  const studentCodeInput = document.getElementById('forgot-student-code');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const studentCode = studentCodeInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return showToast('يرجى إدخال Gmail صحيح.', 'warning');
    }
    if (!/^[BS][0-9]+$/.test(studentCode)) {
      return showToast('كود الطالب غير صحيح. يجب أن يبدأ بـ B أو S متبوعًا بأرقام.', 'warning');
    }
    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, studentCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'تعذر إرسال رسالة إعادة التعيين.');
      if (!data.data?.resetToken) throw new Error('طلب تغيير كلمة المرور غير صالح.');
      sessionStorage.setItem('passwordResetToken', data.data.resetToken);
      window.location.href = 'reset-password.html';
    } catch (error) { showToast(error.message, 'danger'); }
  });
});
