const express = require('express');
const router = express.Router();
const {
  createAttendance,
  saveMyOvertime,
  getMyAttendance,
  getTeamLsMembers,
  getTeamAttendance,
  updateApproval,
  updateApprovalBulk,
  getMonthlyAttendanceRecap,
  getAttendanceDetail,
} = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

// LS routes
router.post('/overtime', authenticate, authorize('ls'), saveMyOvertime);
router.post('/', authenticate, authorize('ls'), createAttendance);
router.get('/my', authenticate, authorize('ls'), getMyAttendance);

// Supervisor routes
router.get('/team/members', authenticate, authorize('ls_supervisor'), getTeamLsMembers);
router.get('/team', authenticate, authorize('ls_supervisor'), getTeamAttendance);
router.get('/team/monthly-recap', authenticate, authorize('ls_supervisor'), getMonthlyAttendanceRecap);
router.get('/team', authenticate, authorize('ls_supervisor'), getTeamAttendance);
router.put('/:id/approval', authenticate, authorize('ls_supervisor'), updateApproval);
router.put('/approval/bulk', authenticate, authorize('ls_supervisor'), updateApprovalBulk);

// Shared detail view
router.get('/:id', authenticate, authorize('ls', 'ls_supervisor', 'vendor'), getAttendanceDetail);

module.exports = router;
