const express = require('express');
const router = express.Router();
const {
  createLeave,
  getMyLeaves,
  getTeamLeaves,
  updateLeaveApproval,
} = require('../controllers/leaveController');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/', authenticate, authorize('ls'), createLeave);
router.get('/my', authenticate, authorize('ls'), getMyLeaves);
router.get('/team', authenticate, authorize('ls_supervisor'), getTeamLeaves);
router.put('/:id/approval', authenticate, authorize('ls_supervisor'), updateLeaveApproval);

module.exports = router;
