/**
 * Catch async errors and forward to Express next()
 * @param {Function} fn Async route handler function
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = catchAsync;
