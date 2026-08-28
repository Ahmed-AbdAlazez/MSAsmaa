const express = require('express');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const { getMyMistakes } = require('../controllers/studentMistakeController');

const router = express.Router();
router.get('/mistakes', protect, restrictTo('STUDENT'), getMyMistakes);
module.exports = router;
