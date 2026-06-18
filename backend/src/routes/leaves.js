const express = require('express');
const router = express.Router();
const {
  createLeave,
  getMyLeaves,
  getTeamLeaves,
  updateLeaveApproval,
  updateLeaveApprovalBulk,
  cancelOrWithdrawLeave,
  downloadLeaveAttachment,
  streamLeaveAttachmentFile,
  handleLeaveAttachmentUpload,
} = require('../controllers/leaveController');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/', authenticate, authorize('ls'), handleLeaveAttachmentUpload, createLeave);
router.get('/my', authenticate, authorize('ls'), getMyLeaves);
// Cancel (pending → cancelled) / Withdraw (approved → withdrawn) own request.
router.put('/:id/cancel-withdraw', authenticate, authorize('ls'), cancelOrWithdrawLeave);
/** team/month-stats & team/employees-overview are registered in index.js */
router.get('/team', authenticate, authorize('ls_supervisor'), getTeamLeaves);
router.put('/approval/bulk', authenticate, authorize('ls_supervisor'), updateLeaveApprovalBulk);
router.get('/:id/attachment/file', authenticate, authorize('ls', 'ls_supervisor'), streamLeaveAttachmentFile);
router.get('/:id/attachment', authenticate, authorize('ls', 'ls_supervisor'), downloadLeaveAttachment);
router.put('/:id/approval', authenticate, authorize('ls_supervisor'), updateLeaveApproval);

module.exports = router;
