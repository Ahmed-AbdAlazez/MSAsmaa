const express = require('express');
const studentController = require('../controllers/studentController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

// The backend, rather than the dashboard UI, is the authority for this area.
router.use(protect, restrictTo('TEACHER'));
router.get('/count', studentController.getApprovedStudentCount);
router.get('/', studentController.getApprovedStudents);
router.delete('/:id', studentController.deleteStudent);

module.exports = router;
