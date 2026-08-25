const express = require('express');
const authRoutes = require('./authRoutes');
const registrationRequestRoutes = require('./registrationRequestRoutes');
const quizRoutes = require('./quizzes/quiz.routes.js');

const router = express.Router();

/**
 * Health check & API status route
 * @route   GET /api/health or /api/v1/health
 * @desc    Check if backend API service is running
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    message: 'Educational Platform API is running smoothly',
    timestamp: new Date().toISOString(),
  });
});

/**
 * API Base Welcome route
 * @route   GET /api or /api/v1
 * @desc    API Root info
 * @access  Public
 */
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Educational Platform API',
    version: '1.0.0',
  });
});

// v1 Resource Routes
router.use('/v1/auth', authRoutes);
router.use('/v1/registration-requests', registrationRequestRoutes);

// Direct aliases for convenience
router.use('/auth', authRoutes);
router.use('/registration-requests', registrationRequestRoutes);
router.use('/', quizRoutes);

module.exports = router;
