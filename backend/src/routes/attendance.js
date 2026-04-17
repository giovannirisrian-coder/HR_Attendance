const express = require('express');
const router = express.Router();
const {
  createAttendance,
  getMyAttendance,
  getTeamAttendance,
  updateApproval,
  getAttendanceDetail,
} = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

// LS routes
router.post('/', authenticate, authorize('ls'), createAttendance);
router.get('/my', authenticate, authorize('ls'), getMyAttendance);

// Supervisor routes
router.get('/team', authenticate, authorize('ls_supervisor'), getTeamAttendance);
router.put('/:id/approval', authenticate, authorize('ls_supervisor'), updateApproval);

// Shared detail view
router.get('/:id', authenticate, authorize('ls', 'ls_supervisor', 'vendor'), getAttendanceDetail);

module.exports = router;
