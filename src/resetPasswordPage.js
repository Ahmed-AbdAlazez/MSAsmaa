const API_BASE = import.meta.env.VITE_API_URL;
const strongPassword = (value) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);

function showToast(message, type = 'success') {
  if (typeof window.showToast === 'function') return window.showToast(message, type);
  console.log(`[toast:${type}] ${message}`);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reset-password-form');
  const token = new URLSearchParams(window.location.search).get('token');
  const passwordInput = document.getElementById('new-password');
  const confirmInput = document.getElementById('confirm-new-password');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = passwordInput.value;
    if (!token) return showToast('رابط إعادة تعيين كلمة المرور غير صالح.', 'danger');
    if (!strongPassword(password)) return showToast('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم واحد على الأقل.', 'warning');
    if (password !== confirmInput.value) return showToast('كلمتا المرور غير متطابقتين.', 'warning');
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword: confirmInput.value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'تعذر تغيير كلمة المرور.');
      showToast(data.message || 'تم تغيير كلمة المرور بنجاح.', 'success');
      setTimeout(() => { window.location.href = 'login.html'; }, 1000);
    } catch (error) { showToast(error.message, 'danger'); }
  });
});
