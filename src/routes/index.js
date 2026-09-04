const express = require("express");
const authRoutes = require("./authRoutes");
const registrationRequestRoutes = require("./registrationRequestRoutes");
const studentRoutes = require("./studentRoutes");
const notificationsRoutes = require("./notifications.routes.js");
const quizRoutes = require("./quizzes/quiz.routes.js");
const studentMistakeRoutes = require('./studentMistake.routes');
const liveSessionRoutes = require('./live-session.routes.js');

const router = express.Router();

/**
 * Health check & API status route
 * @route   GET /api/health or /api/v1/health
 * @desc    Check if backend API service is running
 * @access  Public
 */
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    message: "منصة التعلم تعمل بشكل جيد",
    timestamp: new Date().toISOString(),
  });
});

/**
 * API Base Welcome route
 * @route   GET /api or /api/v1
 * @desc    API Root info
 * @access  Public
 */
router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "مرحباً بك في منصة التعلم",
    version: "1.0.0",
  });
});

// v1 Resource Routes
router.use("/v1/auth", authRoutes);
router.use("/v1/registration-requests", registrationRequestRoutes);
router.use("/v1/students", studentRoutes);
router.use('/v1/student', studentMistakeRoutes);
router.use("/v1/live", liveSessionRoutes);
router.use("/v1", notificationsRoutes);

// Direct aliases for convenience
router.use("/auth", authRoutes);
router.use("/registration-requests", registrationRequestRoutes);
router.use("/students", studentRoutes);
router.use("/live", liveSessionRoutes);
router.use("/", notificationsRoutes);
router.use("/", quizRoutes);

module.exports = router;
