const { prisma } = require('../config/db');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

/**
 * Student Registration (Public)
 * @route   POST /api/v1/auth/signup
 * @desc    Submit student registration request (pending teacher approval)
 * @access  Public
 */
const signup = catchAsync(async (req, res, next) => {
  const { studentCode, name, password } = req.body;

  // 1. Validate required fields
  if (!studentCode || !name || !password) {
    return next(
      new AppError('Please provide studentCode, name, and password.', 400)
    );
  }

  // Trim whitespace
  const trimmedCode = String(studentCode).trim();
  const trimmedName = String(name).trim();

  if (!trimmedCode || !trimmedName || !password) {
    return next(
      new AppError('Fields cannot be empty.', 400)
    );
  }

  // 2. Check if studentCode already exists
  const existingUser = await prisma.user.findUnique({
    where: { studentCode: trimmedCode },
  });

  if (existingUser) {
    return next(
      new AppError('A student with this code is already registered.', 409)
    );
  }

  // 3. Hash password
  const hashedPassword = await hashPassword(password);

  // 4. Create user with default role=STUDENT and status=PENDING
  await prisma.user.create({
    data: {
      studentCode: trimmedCode,
      name: trimmedName,
      password: hashedPassword,
      role: 'STUDENT',
      status: 'PENDING',
    },
  });

  // 5. Respond with waiting message (no JWT issued, no sensitive data returned)
  res.status(201).json({
    status: 'success',
    message: 'Registration request submitted. Waiting for teacher approval.',
  });
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
      new AppError('Please provide both studentCode and password.', 400)
    );
  }

  const trimmedCode = String(studentCode).trim();

  // 2. Find user by studentCode
  const user = await prisma.user.findUnique({
    where: { studentCode: trimmedCode },
  });

  if (!user) {
    return next(new AppError('Invalid credentials.', 401));
  }

  // 3. Verify password
  const isPasswordCorrect = await comparePassword(password, user.password);
  if (!isPasswordCorrect) {
    return next(new AppError('Invalid credentials.', 401));
  }

  // 4. Check account status
  if (user.status === 'PENDING') {
    return next(
      new AppError(
        'Your registration request is pending. Waiting for teacher approval.',
        403
      )
    );
  }

  if (user.status === 'REJECTED') {
    return next(
      new AppError(
        'Your registration request was rejected. Please contact the teacher.',
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
};
