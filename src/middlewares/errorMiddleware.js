/**
 * 404 Not Found Middleware
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  let message = err.message || 'Something went wrong!';
  let status = err.status || (statusCode >= 400 && statusCode < 500 ? 'fail' : 'error');

  // Handle Prisma Unique Constraint Error (e.g. duplicate studentCode)
  if (err.code === 'P2002') {
    statusCode = 409;
    status = 'fail';
    const fields = err.meta && err.meta.target ? err.meta.target.join(', ') : 'field';
    message = `A record with this ${fields} already exists.`;
  }

  // Handle Prisma Record Not Found
  if (err.code === 'P2025') {
    statusCode = 404;
    status = 'fail';
    message = 'Requested record not found.';
  }

  // Handle JWT Error
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    status = 'fail';
    message = 'Invalid token. Please log in again.';
  }

  // Handle JWT Expired Error
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    status = 'fail';
    message = 'Your session has expired. Please log in again.';
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
