const API_BASE = import.meta.env.VITE_API_URL;

function showToast(message, type = 'success') {
  if (typeof window.showToast === 'function') return window.showToast(message, type);
  console.log(`[toast:${type}] ${message}`);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgot-password-form');
  const emailInput = document.getElementById('forgot-email');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return showToast('يرجى إدخال Gmail صحيح.', 'warning');
    }
    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'تعذر إرسال رسالة إعادة التعيين.');
      showToast(data.message, 'success');
      form.reset();
    } catch (error) { showToast(error.message, 'danger'); }
  });
});
