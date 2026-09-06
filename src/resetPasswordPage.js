const rawApiUrl = import.meta.env.VITE_API_URL || '/api/v1';
const API_BASE = (typeof rawApiUrl === 'string' && rawApiUrl.includes('vercel.app')) ? '/api/v1' : rawApiUrl;
const strongPassword = (value) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);

function showToast(message, type = 'success') {
  if (typeof window.showToast === 'function') return window.showToast(message, type);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reset-password-form');
  const token = sessionStorage.getItem('passwordResetToken');
  const passwordInput = document.getElementById('new-password');
  const confirmInput = document.getElementById('confirm-new-password');
  const successPanel = document.getElementById('reset-success');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = passwordInput.value;
    if (!token) return showToast('طلب تغيير كلمة المرور غير صالح.', 'danger');
    if (!strongPassword(password)) return showToast('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم واحد على الأقل.', 'warning');
    if (password !== confirmInput.value) return showToast('كلمتا المرور غير متطابقتين.', 'warning');
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword: confirmInput.value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'تعذر تغيير كلمة المرور.');
      sessionStorage.removeItem('passwordResetToken');
      form.hidden = true;
      successPanel.hidden = false;
    } catch (error) { showToast(error.message, 'danger'); }
  });
});
