/**
 * 404 Not Found Middleware
 */
const notFound = (req, res, next) => {
  const error = new Error(`الصفحة غير موجودة - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  let message = err.message || 'حدث خطأ ما!';
  let status = err.status || (statusCode >= 400 && statusCode < 500 ? 'fail' : 'error');

  // Handle Prisma Unique Constraint Error (e.g. duplicate studentCode)
  if (err.code === 'P2002') {
    statusCode = 409;
    status = 'fail';
    const fields = err.meta && err.meta.target ? err.meta.target.join(', ') : 'field';
    message = String(fields).includes('email')
      ? 'هذا البريد الإلكتروني مستخدم بالفعل.'
      : 'يوجد سجل بنفس هذه البيانات بالفعل.';
  }

  // Handle Prisma Record Not Found
  if (err.code === 'P2025') {
    statusCode = 404;
    status = 'fail';
    message = 'السجل المطلوب غير موجود.';
  }

  // Handle JWT Error
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    status = 'fail';
    message = 'رمز غير صالح. يرجى تسجيل الدخول مرة أخرى.';
  }

  // Handle JWT Expired Error
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    status = 'fail';
    message = 'انتهت صلاحية جلستك. يرجى تسجيل الدخول مرة أخرى.';
  }

  res.status(statusCode).json({
    success: false,
    status,
    message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = {
  notFound,
  errorHandler,
};
