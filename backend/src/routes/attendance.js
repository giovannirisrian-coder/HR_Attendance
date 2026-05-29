const express = require('express');
const router = express.Router();
const {
  createAttendance,
  getMyAttendance,
  getTeamLsMembers,
  getTeamAttendance,
  updateApproval,
  updateApprovalBulk,
  getMonthlyAttendanceRecap,
  getAttendanceDetail,
  cancelOrWithdrawAttendance,
} = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

// LS routes
// NOTE: legacy POST /api/attendance/overtime was removed when the dedicated
// Overtime workflow shipped. Use POST /api/overtimes instead.
router.post('/', authenticate, authorize('ls'), createAttendance);
router.get('/my', authenticate, authorize('ls'), getMyAttendance);
// Cancel (pending → cancelled) / Withdraw (approved → withdrawn) own request.
router.put('/:id/cancel-withdraw', authenticate, authorize('ls'), cancelOrWithdrawAttendance);

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
