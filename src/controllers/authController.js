const { prisma } = require('../config/db');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const crypto = require('crypto');

const STUDENT_CODE_PATTERN = /^[BS][0-9]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const isStrongPassword = (value) =>
  /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);

/**
 * Student Registration (Public)
 * @route   POST /api/v1/auth/signup
 * @desc    Submit student registration request (pending teacher approval)
 * @access  Public
 */
const signup = catchAsync(async (req, res, next) => {
  const { studentCode, name, email, password, confirmPassword } = req.body;

  // 1. Validate required fields
  if (!studentCode || !name || !email || !password || !confirmPassword) {
    return next(
      new AppError('يرجى إدخال كود الطالب والاسم وGmail وكلمة المرور.', 400)
    );
  }

  // Trim whitespace
  const trimmedCode = String(studentCode).trim();
  const trimmedName = String(name).trim();
  const normalizedEmail = String(email).trim().toLowerCase();

  if (!trimmedCode || !trimmedName || !normalizedEmail || !password) {
    return next(
      new AppError('لا يمكن ترك الحقول فارغة.', 400)
    );
  }

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return next(new AppError('يرجى إدخال Gmail صحيح.', 400));
  }

  if (!isStrongPassword(String(password))) {
    return next(new AppError('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم واحد على الأقل.', 400));
  }
  if (password !== confirmPassword) {
    return next(new AppError('كلمتا المرور غير متطابقتين.', 400));
  }

  // 2. Check if studentCode already exists
  const existingUser = await prisma.user.findUnique({
    where: { studentCode: trimmedCode },
  });

  if (existingUser) {
    return next(
      new AppError('يوجد طالب مسجّل بالفعل بهذا الكود.', 409)
    );
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existingEmail) {
    return next(new AppError('هذا البريد الإلكتروني مستخدم بالفعل.', 409));
  }

  // 3. Hash password
  const hashedPassword = await hashPassword(password);

  // 4. Create user with default role=STUDENT and status=PENDING
  await prisma.user.create({
    data: {
      studentCode: trimmedCode,
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'STUDENT',
      status: 'PENDING',
    },
  });

  // 5. Respond with waiting message (no JWT issued, no sensitive data returned)
  res.status(201).json({
    status: 'success',
    message: 'تم إرسال طلب التسجيل. بانتظار موافقة المعلمة.',
  });
});

/**
 * Verify a student's recovery details and issue a one-time reset authorization.
 * @route POST /api/v1/auth/forgot-password
 */
const forgotPassword = catchAsync(async (req, res) => {
  const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
  const studentCode = String(req.body.studentCode || '').trim();

  if (!EMAIL_PATTERN.test(normalizedEmail) || !STUDENT_CODE_PATTERN.test(studentCode)) {
    return res.status(400).json({ status: 'fail', message: 'بيانات التحقق غير صحيحة.' });
  }

  // A single lookup prevents mixing an email from one student with the code
  // of another. Teachers are excluded regardless of whether they have email.
  const user = await prisma.user.findFirst({
    where: { email: normalizedEmail, studentCode, role: 'STUDENT' },
  });
  if (!user) {
    return res.status(400).json({ status: 'fail', message: 'بيانات التحقق غير صحيحة.' });
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: tokenHash,
      resetPasswordExpires: new Date(Date.now() + RESET_TOKEN_LIFETIME_MS),
    },
  });

  // This is returned only after server-side verification and is never a user
  // id. The browser keeps it in sessionStorage rather than the URL/history.
  return res.status(200).json({ status: 'success', data: { resetToken: rawToken } });
});

/**
 * Complete a password reset using a short-lived one-time token.
 * @route POST /api/v1/auth/reset-password
 */
const resetPassword = catchAsync(async (req, res, next) => {
  const { token, password, confirmPassword } = req.body;
  if (!token || !password || !confirmPassword) {
    return next(new AppError('طلب تغيير كلمة المرور غير صالح.', 400));
  }

  if (!isStrongPassword(String(password))) {
    return next(new AppError('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم واحد على الأقل.', 400));
  }
  if (password !== confirmPassword) {
    return next(new AppError('كلمتا المرور غير متطابقتين.', 400));
  }

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const user = await prisma.user.findFirst({
    where: { resetPasswordToken: tokenHash, role: 'STUDENT' },
  });

  if (!user) {
    return next(new AppError('طلب تغيير كلمة المرور غير صالح.', 400));
  }
  if (!user.resetPasswordExpires || user.resetPasswordExpires <= new Date()) {
    return next(new AppError('انتهت صلاحية عملية تغيير كلمة المرور. يرجى المحاولة مرة أخرى.', 400));
  }

  const hashedPassword = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
  });

  return res.status(200).json({ status: 'success', message: 'تم تغيير كلمة المرور بنجاح.' });
});

/**
 * User Login (Student & Teacher)
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user & return JWT token if approved
 * @access  Public
 */
const login = catchAsync(async (req, res, next) => {
  const { studentCode, password } = req.body;

  // 1. Validate input
  if (!studentCode || !password) {
    return next(
      new AppError('يرجى إدخال كود الطالب وكلمة المرور.', 400)
    );
  }

  const trimmedCode = String(studentCode).trim();

  // 2. Find user by studentCode
  const user = await prisma.user.findUnique({
    where: { studentCode: trimmedCode },
  });

  if (!user) {
    return next(new AppError('بيانات الدخول غير صحيحة.', 401));
  }

  // 3. Verify password
  const isPasswordCorrect = await comparePassword(password, user.password);
  if (!isPasswordCorrect) {
    return next(new AppError('بيانات الدخول غير صحيحة.', 401));
  }

  // 4. Check account status
  if (user.status === 'PENDING') {
    return next(
      new AppError(
        'طلب تسجيلك ما زال قيد المراجعة. انتظري موافقة المعلمة.',
        403
      )
    );
  }

  if (user.status === 'REJECTED') {
    return next(
      new AppError(
        'تم رفض طلب تسجيلك. يرجى التواصل مع المعلمة.',
        403
      )
    );
  }

  // 5. Generate JWT token
  const token = signToken({
    id: user.id,
    role: user.role,
  });

  // 6. Return safe user data without password
  res.status(200).json({
    status: 'success',
    token,
    data: {
      user: {
        id: user.id,
        studentCode: user.studentCode,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
    },
  });
});

module.exports = {
  signup,
  login,
  forgotPassword,
  resetPassword,
};
