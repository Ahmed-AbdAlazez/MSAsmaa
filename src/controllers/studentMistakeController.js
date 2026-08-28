const { prisma } = require('../config/db');
const catchAsync = require('../utils/catchAsync');

const parsePositiveInt = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

// The verified JWT is the only source of the student's identity.
const getMyMistakes = catchAsync(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInt(req.query.limit, 20, 100);
  const where = { studentId: req.user.id };
  const [mistakes, total] = await prisma.$transaction([
    prisma.studentMistake.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      include: { quiz: { select: { title: true } }, question: { select: { text: true } } },
    }),
    prisma.studentMistake.count({ where }),
  ]);
  res.status(200).json({
    status: 'success', results: mistakes.length,
    data: {
      mistakes: mistakes.map((mistake) => ({
        id: mistake.id, quizId: mistake.quizId, quizTitle: mistake.quiz.title,
        questionId: mistake.questionId, questionText: mistake.question.text,
        studentAnswer: mistake.studentAnswer, correctAnswer: mistake.correctAnswer,
        createdAt: mistake.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
});

module.exports = { getMyMistakes };
