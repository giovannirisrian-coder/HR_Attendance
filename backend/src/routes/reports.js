const express = require('express');
const router = express.Router();
const { getReportList, getReportDetail, submitReport } = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const docFields = upload.fields([
  { name: 'bast_file',         maxCount: 1 },
  { name: 'invoice_file',      maxCount: 1 },
  { name: 'recap_salary_file', maxCount: 1 },
  { name: 'tax_file',          maxCount: 1 },
]);

router.get('/', authenticate, authorize('vendor'), getReportList);
router.get('/:userId/:month/:year', authenticate, authorize('vendor'), getReportDetail);
router.post('/:userId/:month/:year', authenticate, authorize('vendor'), docFields, submitReport);

module.exports = router;
