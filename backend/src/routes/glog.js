const express = require('express');
const router = express.Router();
const {
  uploadGlogMiddleware,
  uploadGlog,
  processBatch,
  getProcessJobStatus,
  patchAttendanceFromBatch,
  getBatchDetail,
  listMyBatches,
  syncFromFtm,
  syncFromFingerspot,
} = require('../controllers/glogController');
const { authenticate, authorize } = require('../middleware/auth');

const hrOrSupervisor = ['ls_hr', 'ls_supervisor'];

router.post('/upload', authenticate, authorize(...hrOrSupervisor), uploadGlogMiddleware, uploadGlog);
router.post('/sync-ftm', authenticate, authorize(...hrOrSupervisor), syncFromFtm);
router.post('/sync-fingerspot', authenticate, authorize(...hrOrSupervisor), syncFromFingerspot);
router.post('/batches/:id/process', authenticate, authorize(...hrOrSupervisor), processBatch);
router.get('/jobs/:jobId', authenticate, authorize(...hrOrSupervisor), getProcessJobStatus);
router.post(
  '/batches/:id/patch-attendance',
  authenticate,
  authorize(...hrOrSupervisor),
  patchAttendanceFromBatch
);
router.get('/batches', authenticate, authorize(...hrOrSupervisor), listMyBatches);
router.get('/batches/:id', authenticate, authorize(...hrOrSupervisor), getBatchDetail);

module.exports = router;
