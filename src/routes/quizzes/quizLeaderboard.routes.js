/**
 * quizLeaderboard.routes.js
 * ---------------------------------------------------------------------------
 * Rankings, with the CRITICAL release rule:
 *
 *   A leaderboard must NOT reflect any score until that quiz's end_time has
 *   passed. The check happens FRESH on every request (Date.now() vs
 *   quiz.endTime) — no stored "released" flag that could go stale or be
 *   flipped early. Calling before end_time returns released:false and NO
 *   ranking data at all.
 *
 *   GET /api/quizzes/:quizId/leaderboard       one quiz's ranking
 *   GET /api/courses/:courseId/leaderboard     cumulative across the course
 *
 * Both endpoints:
 *   - use each student's BEST attempt when several exist (grant-retry),
 *   - include students who never attempted at the bottom with 0,
 *   - show REAL names (intentional per platform requirements).
 */

const express = require("express");

const { requireAuth } = require("../../middleware/auth.middleware.js");
const {
  getQuizById,
  getSubmittedResultsForQuiz,
  getQuizzesForCourse,
  getStudentNameById,
  getStudentIdsForCourse,
} = require("../../services/quiz.stub.service.js");

const router = express.Router();

// Per-route gates (see quizCreation.routes.js for why NOT router.use).
// Leaderboards are open to ANY authenticated user (students check them too).

/**
 * Sorts scores into competition ranks: highest first; equal scores share the
 * same rank and the next rank is skipped accordingly (1,2,2,4...).
 *
 * @param {object[]} entries - { studentId, studentName, bestScore }
 * @returns {object[]} Same entries plus a `rank` field, sorted for display.
 */
function assignRanks(entries) {
  return [...entries]
    .sort(
      (a, b) =>
        b.bestScore - a.bestScore ||
        a.studentName.localeCompare(b.studentName, "ar")
    )
    .map((entry, index, sorted) => ({
      ...entry,
      // First entry always rank 1; later entries share rank when tied with
      // the previous score, otherwise they take their 1-based position.
      rank:
        index > 0 && sorted[index - 1].bestScore === entry.bestScore
          ? sorted[index - 1].rank
          : index + 1,
    }));
}

/**
 * Builds the ranking rows for ONE quiz from its submitted results.
 * Best attempt wins; students without any attempt are appended with 0.
 *
 * @param {string} quizId    - The quiz.
 * @param {string[]} roster  - Extra student ids to include with zero.
 * @returns {Promise<object[]>} Ranked entries.
 */
async function buildQuizRanking(quizId, roster = []) {
  const submitted = await getSubmittedResultsForQuiz(quizId);

  // best score per student (a student may have 1..N attempts)
  const bestByStudent = new Map();
  for (const result of submitted) {
    const currentBest = bestByStudent.get(result.studentId);
    if (currentBest == null || result.score > currentBest) {
      bestByStudent.set(result.studentId, result.score);
    }
  }

  const entries = [];
  const allStudentIds = new Set([...bestByStudent.keys(), ...roster]);

  for (const studentId of allStudentIds) {
    entries.push({
      studentId,
      studentName: await getStudentNameById(studentId),
      // Never-attempted students land here as 0 — included, not excluded.
      bestScore: bestByStudent.get(studentId) ?? 0,
      attempted: bestByStudent.has(studentId),
    });
  }

  return assignRanks(entries);
}

/**
 * GET /quizzes/:quizId/leaderboard
 */
router.get("/quizzes/:quizId/leaderboard", requireAuth, async (req, res) => {
  const quiz = await getQuizById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "الاختبار غير موجود." });

  // SERVER-SIDE TIME GATE — recomputed every call, never stored.
  if (Date.now() < Date.parse(quiz.endTime)) {
    return res.json({
      released: false,
      availableAfter: quiz.endTime,
      message:
        "لوحة الترتيب تظهر بعد انتهاء وقت الاختبار للجميع.",
      rankings: null, // deliberately empty: zero information leaks early
    });
  }

  const rankings = await buildQuizRanking(quiz.id);
  return res.json({
    released: true,
    releasedAt: quiz.endTime,
    quiz: { id: quiz.id, title: quiz.title },
    rankings,
  });
});

/**
 * GET /courses/:courseId/leaderboard
 * Cumulative: sum of each student's BEST score on every quiz in the course.
 * Quizzes whose end_time has not passed yet contribute NOTHING yet and are
 * reported separately so the UI can show how many are still pending.
 */
router.get("/courses/:courseId/leaderboard", requireAuth, async (req, res) => {
  const quizzes = await getQuizzesForCourse(req.params.courseId);

  const releasedQuizzes = [];
  const pendingQuizzes = [];

  for (const quiz of quizzes) {
    if (Date.now() >= Date.parse(quiz.endTime)) {
      releasedQuizzes.push(quiz);
    } else {
      pendingQuizzes.push({ id: quiz.id, title: quiz.title, endTime: quiz.endTime });
    }
  }

  // Sum of best scores across released quizzes, keyed by student.
  const totalsByStudent = new Map();

  for (const quiz of releasedQuizzes) {
    const ranking = await buildQuizRanking(quiz.id);
    for (const entry of ranking) {
      // Missing any given quiz counts as 0 for that quiz ("bottom with
      // zero" rule applied per-quiz inside the sum).
      const current = totalsByStudent.get(entry.studentId);
      totalsByStudent.set(entry.studentId, {
        studentId: entry.studentId,
        studentName: entry.studentName,
        totalScore: (current ? current.totalScore : 0) + entry.bestScore,
        quizzesCounted: (current ? current.quizzesCounted : 0) + 1,
      });
    }
  }

  // Roster students with no released-quizzes points at all still appear.
  const roster = await getStudentIdsForCourse(req.params.courseId);
  for (const studentId of roster) {
    if (!totalsByStudent.has(studentId)) {
      totalsByStudent.set(studentId, {
        studentId,
        studentName: await getStudentNameById(studentId),
        totalScore: 0,
        quizzesCounted: 0,
      });
    }
  }

  return res.json({
    courseId: String(req.params.courseId),
    released: pendingQuizzes.length === 0,
    pendingQuizzes, // still-open quizzes excluded from the sums (time-gated)
    rankings: assignRanks([...totalsByStudent.values()].map((entry) => ({
      ...entry,
      bestScore: entry.totalScore,
    }))),
  });
});

module.exports = router;
