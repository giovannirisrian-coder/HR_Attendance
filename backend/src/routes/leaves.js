const express = require('express');
const router = express.Router();
const {
  createLeave,
  getMyLeaves,
  getTeamLeaves,
  updateLeaveApproval,
  updateLeaveApprovalBulk,
} = require('../controllers/leaveController');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/', authenticate, authorize('ls'), createLeave);
router.get('/my', authenticate, authorize('ls'), getMyLeaves);
/** team/month-stats & team/employees-overview are registered in index.js */
router.get('/team', authenticate, authorize('ls_supervisor'), getTeamLeaves);
router.put('/approval/bulk', authenticate, authorize('ls_supervisor'), updateLeaveApprovalBulk);
router.put('/:id/approval', authenticate, authorize('ls_supervisor'), updateLeaveApproval);

module.exports = router;
