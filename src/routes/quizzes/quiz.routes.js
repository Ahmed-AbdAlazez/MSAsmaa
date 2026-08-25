/**
 * quiz.routes.js
 * ---------------------------------------------------------------------------
 * Main router for the quiz feature. Mounts the five logical groups so each
 * stays reviewable/testable on its own:
 *
 *   quizCreation.routes.js     teacher builds quizzes & questions
 *   quizTaking.routes.js       student start / resume / autosave / submit
 *   quizResults.routes.js      teacher: grant-retry + all attempts view
 *   quizLeaderboard.routes.js  time-gated rankings (quiz & course)
 *   quizReview.routes.js       time-gated answer reveal
 *
 * Mounted in app.js with app.use("/api", ...) so the final endpoints are:
 *   POST /api/quizzes
 *   GET  /api/quizzes/:quizId
 *   GET  /api/lessons/:lessonId/quizzes
 *   POST /api/quizzes/:quizId/questions
 *   GET  /api/quizzes/:quizId/questions
 *   POST /api/quizzes/:quizId/start
 *   GET  /api/quizzes/:quizId/attempt
 *   POST /api/quizzes/:quizId/answers
 *   POST /api/quizzes/:quizId/submit
 *   POST /api/quizzes/:quizId/students/:studentId/grant-retry
 *   GET  /api/quizzes/:quizId/results
 *   GET  /api/quizzes/:quizId/leaderboard
 *   GET  /api/courses/:courseId/leaderboard
 *   GET  /api/quiz-results/:resultId/review
 */

const express = require("express");

const router = express.Router();

// ORDER MATTERS: quizTaking defines GET /quizzes/available which must be
// matched before quizCreation's parameterized GET /quizzes/:quizId (that
// one is teacher-gated and would otherwise swallow the student route with
// a 403). All other paths are disjoint between groups.
router.use(require("./quizTaking.routes.js"));
router.use(require("./quizCreation.routes.js"));
router.use(require("./quizResults.routes.js"));
router.use(require("./quizLeaderboard.routes.js"));
router.use(require("./quizReview.routes.js"));
router.use(require("./quizManagement.routes.js"));

module.exports = router;
