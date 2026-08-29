const { prisma } = require('../config/db');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { verifyToken } = require('../utils/jwt');

/**
 * Protect middleware - ensures the request contains a valid JWT Bearer token
 * and that the corresponding user exists in the database.
 */
const protect = catchAsync(async (req, res, next) => {
  let token;

  // 1. Check for Bearer token in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(
      new AppError('أنت غير مسجّل الدخول. يرجى تسجيل الدخول للوصول.', 401)
    );
  }

  // 2. Verify token
  let decoded;
  try {
    decoded = await verifyToken(token);
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('رمز غير صالح. يرجى تسجيل الدخول مرة أخرى.', 401));
    }
    if (err.name === 'TokenExpiredError') {
      return next(
        new AppError('انتهت صلاحية جلستك. يرجى تسجيل الدخول مرة أخرى.', 401)
      );
    }
    return next(new AppError('فشل التحقق من الهوية.', 401));
  }

  // 3. Check if user still exists
  const currentUser = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: {
      id: true,
      studentCode: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!currentUser) {
    return next(
      new AppError('المستخدم المرتبط بهذا الرمز لم يعد موجوداً.', 401)
    );
  }

  // 4. Attach user to request object
  req.user = currentUser;
  next();
});

/**
 * Authorization middleware - restricts route access to specified roles
 * @param {...string} roles - Allowed user roles (e.g. 'TEACHER', 'STUDENT')
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError('ليس لديك صلاحية للقيام بهذا الإجراء.', 403)
      );
    }
    next();
  };
};

module.exports = {
  protect,
  restrictTo,
};
