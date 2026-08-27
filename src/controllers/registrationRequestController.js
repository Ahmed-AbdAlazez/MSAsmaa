const { prisma } = require('../config/db');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/**
 * Get count of pending registration requests
 * @route   GET /api/v1/registration-requests/count
 * @desc    Get total count of pending student registration requests
 * @access  Private (Teacher only)
 */
const getPendingCount = catchAsync(async (req, res, next) => {
  const count = await prisma.user.count({
    where: {
      status: 'PENDING',
      role: 'STUDENT',
    },
  });

  res.status(200).json({
    status: 'success',
    data: {
      count,
    },
  });
});

/**
 * Get all pending student registration requests
 * @route   GET /api/v1/registration-requests
 * @desc    Get list of all pending student registrations
 * @access  Private (Teacher only)
 */
const getPendingRequests = catchAsync(async (req, res, next) => {
  const requests = await prisma.user.findMany({
    where: {
      status: 'PENDING',
      role: 'STUDENT',
    },
    select: {
      id: true,
      studentCode: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 100,
  });

  res.status(200).json({
    status: 'success',
    results: requests.length,
    data: {
      requests,
    },
  });
});

/**
 * Approve a student registration request
 * @route   PATCH /api/v1/registration-requests/:id/approve
 * @desc    Approve student registration to grant platform access
 * @access  Private (Teacher only)
 */
const approveRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // 1. Find user by ID
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    return next(new AppError('No student found with the provided ID.', 404));
  }

  // 2. Ensure user is a student
  if (user.role !== 'STUDENT') {
    return next(
      new AppError('Only student registration requests can be approved.', 400)
    );
  }

  // 3. Check if already approved
  if (user.status === 'APPROVED') {
    return next(
      new AppError('This student registration has already been approved.', 400)
    );
  }

  // 4. Update status to APPROVED (allows re-approving previously rejected students if teacher decides to accept them)
  const updatedUser = await prisma.user.update({
    where: { id },
    data: { status: 'APPROVED' },
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

  res.status(200).json({
    status: 'success',
    message: 'Student registration request approved successfully.',
    data: {
      user: updatedUser,
    },
  });
});

/**
 * Reject a student registration request
 * @route   PATCH /api/v1/registration-requests/:id/reject
 * @desc    Reject student registration request
 * @access  Private (Teacher only)
 */
const rejectRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // 1. Find user by ID
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    return next(new AppError('No student found with the provided ID.', 404));
  }

  // 2. Ensure user is a student
  if (user.role !== 'STUDENT') {
    return next(
      new AppError('Only student registration requests can be rejected.', 400)
    );
  }

  // 3. Check if already rejected
  if (user.status === 'REJECTED') {
    return next(
      new AppError('This student registration is already rejected.', 400)
    );
  }

  // 4. Update status to REJECTED
  const updatedUser = await prisma.user.update({
    where: { id },
    data: { status: 'REJECTED' },
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

  res.status(200).json({
    status: 'success',
    message: 'Student registration request rejected.',
    data: {
      user: updatedUser,
    },
  });
});

module.exports = {
  getPendingCount,
  getPendingRequests,
  approveRequest,
  rejectRequest,
};
