const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getAttendanceSyncSchedulerStatus,
  triggerFtmSchedulerNow,
  triggerFingerspotSchedulerNow,
} = require('../controllers/attendanceSyncSchedulerController');

router.use(authenticate, authorize('ls_hr'));

router.get('/status', getAttendanceSyncSchedulerStatus);
router.post('/run-ftm', triggerFtmSchedulerNow);
router.post('/run-fingerspot', triggerFingerspotSchedulerNow);

module.exports = router;
