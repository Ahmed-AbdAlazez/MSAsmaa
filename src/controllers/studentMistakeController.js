const { prisma } = require('../config/db');
const catchAsync = require('../utils/catchAsync');
const { isQuizReleased } = require('../routes/quizzes/quiz.helpers.js');

const parsePositiveInt = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

// The verified JWT is the only source of the student's identity.
const getMyMistakes = catchAsync(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInt(req.query.limit, 20, 100);

  // SECURITY / ANTI-CHEATING:
  // A wrong answer is ONLY ever shown once its quiz's end_time has passed for
  // everyone — the SAME rule the per-quiz review endpoint enforces (via the
  // shared isQuizReleased() helper). Before a quiz's end_time, its mistakes
  // are excluded AT THE DATABASE LEVEL (not just hidden in the UI), so a
  // student can never read their own wrong answers early and leak them to
  // classmates who haven't taken the quiz yet.
  //   isQuizReleased(quiz)  <=>  Date.now() >= quiz.endTime
  //   Prisma filter below   <=>  quiz.endTime <= now   (identical rule)
  const now = new Date();
  const where = {
    studentId: req.user.id,
    quiz: { endTime: { lte: now } },
  };

  const [mistakes, total] = await prisma.$transaction([
    prisma.studentMistake.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      include: { quiz: { select: { title: true, endTime: true } }, question: { select: { text: true } } },
    }),
    prisma.studentMistake.count({ where }),
  ]);

  // Defense in depth: only map mistakes whose quiz is genuinely released. The
  // query already narrowed to released quizzes, but this keeps the payload
  // leak-proof even if a pre-existing/related mistake row slips through.
  const releasedMistakes = mistakes.filter((m) => isQuizReleased(m.quiz));

  res.status(200).json({
    status: 'success', results: releasedMistakes.length,
    data: {
      mistakes: releasedMistakes.map((mistake) => ({
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
