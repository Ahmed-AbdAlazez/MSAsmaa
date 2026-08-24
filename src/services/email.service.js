const nodemailer = require('nodemailer');

const requiredSettings = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

function getTransporter() {
  const missing = requiredSettings.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error('Password reset email is not configured.');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendPasswordResetEmail({ to, resetUrl }) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: 'إعادة تعيين كلمة المرور - منصة المرسال',
    text: `لقد تلقينا طلبًا لإعادة تعيين كلمة المرور. استخدم الرابط التالي خلال 15 دقيقة:\n${resetUrl}\n\nإذا لم تطلب ذلك، فتجاهل هذه الرسالة.`,
    html: `<div dir="rtl"><p>لقد تلقينا طلبًا لإعادة تعيين كلمة المرور في منصة المرسال.</p><p><a href="${resetUrl}">إعادة تعيين كلمة المرور</a></p><p>ينتهي الرابط خلال 15 دقيقة. إذا لم تطلب ذلك، فتجاهل هذه الرسالة.</p></div>`,
  });
}

module.exports = { sendPasswordResetEmail };
