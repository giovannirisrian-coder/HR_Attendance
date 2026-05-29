const express = require('express');
const router = express.Router();
const {
  createOvertime,
  getMyOvertimes,
  getTeamOvertimes,
  updateOvertimeApproval,
  cancelOrWithdrawOvertime,
} = require('../controllers/overtimeController');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/', authenticate, authorize('ls'), createOvertime);
router.get('/my', authenticate, authorize('ls'), getMyOvertimes);
// Cancel (pending → cancelled) / Withdraw (approved → withdrawn) own request.
router.put('/:id/cancel-withdraw', authenticate, authorize('ls'), cancelOrWithdrawOvertime);
router.get('/team', authenticate, authorize('ls_supervisor'), getTeamOvertimes);
router.put('/:id/approval', authenticate, authorize('ls_supervisor'), updateOvertimeApproval);

module.exports = router;
