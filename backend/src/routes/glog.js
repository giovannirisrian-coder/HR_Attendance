const express = require('express');
const router = express.Router();
const {
  uploadGlogMiddleware,
  uploadGlog,
  processBatch,
  getBatchDetail,
  listMyBatches,
} = require('../controllers/glogController');
const { authenticate, authorize } = require('../middleware/auth');

const hrOrSupervisor = ['ls_hr', 'ls_supervisor'];

router.post('/upload', authenticate, authorize(...hrOrSupervisor), uploadGlogMiddleware, uploadGlog);
router.post('/batches/:id/process', authenticate, authorize(...hrOrSupervisor), processBatch);
router.get('/batches', authenticate, authorize(...hrOrSupervisor), listMyBatches);
router.get('/batches/:id', authenticate, authorize(...hrOrSupervisor), getBatchDetail);

module.exports = router;
