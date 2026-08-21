const express = require('express');
const registrationRequestController = require('../controllers/registrationRequestController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

// Protect all registration request routes & restrict to TEACHER role only
router.use(protect);
router.use(restrictTo('TEACHER'));

// Registration request endpoints
router.get('/count', registrationRequestController.getPendingCount);
router.get('/', registrationRequestController.getPendingRequests);
router.patch('/:id/approve', registrationRequestController.approveRequest);
router.patch('/:id/reject', registrationRequestController.rejectRequest);

module.exports = router;
