const { prisma } = require('../config/db');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// This is deliberately an allow-list. Authentication fields must never leave
// the API when a teacher views students.
const safeStudentSelect = {
  id: true,
  studentCode: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const parsePositiveInt = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

/** GET /api/v1/students/count - approved STUDENT accounts only. */
const getApprovedStudentCount = catchAsync(async (req, res) => {
  const count = await prisma.user.count({
    where: { role: 'STUDENT', status: 'APPROVED' },
  });

  res.status(200).json({ status: 'success', data: { count } });
});

/** GET /api/v1/students?search=&page=&limit= */
const getApprovedStudents = catchAsync(async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 100);
  const page = parsePositiveInt(req.query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInt(req.query.limit, 50, 100);
  const where = {
    role: 'STUDENT',
    status: 'APPROVED',
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { studentCode: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [students, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: safeStudentSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    results: students.length,
    data: {
      students,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
});

/** DELETE /api/v1/students/:id - teachers can delete students, never teachers. */
const deleteStudent = catchAsync(async (req, res, next) => {
  const student = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, role: true },
  });

  if (!student) {
    return next(new AppError('No student found with the provided ID.', 404));
  }
  if (student.role !== 'STUDENT') {
    return next(new AppError('Only STUDENT accounts can be deleted through this endpoint.', 400));
  }

  // Quiz attempts store studentId as a plain string, but mistakes are a
  // student-owned dashboard record and must be removed with the account.
  await prisma.$transaction([
    prisma.studentMistake.deleteMany({ where: { studentId: student.id } }),
    prisma.user.delete({ where: { id: student.id } }),
  ]);

  res.status(200).json({
    success: true,
    message: 'Student deleted successfully',
  });
});

module.exports = { getApprovedStudentCount, getApprovedStudents, deleteStudent };
