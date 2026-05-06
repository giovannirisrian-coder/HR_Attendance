const express = require('express');
const router = express.Router();
const {
  getVendorMonthlySummary,
  getVendorMonthlyDetail,
  submitVendorMonthly,
  downloadVendorMonthlyPdf,
} = require('../controllers/reportController');
const {
  downloadSubmissionPdf,
  downloadSubmissionAttachments,
  listHrSubmissions,
  listSsuSubmissions,
  hrApprove,
  hrReject,
  ssuApprove,
  ssuReject,
  ssuMarkPaid,
} = require('../controllers/submissionWorkflowController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const docFields = upload.fields([
  { name: 'tax_invoice_file', maxCount: 1 },
  { name: 'invoice_file', maxCount: 1 },
  { name: 'receipt_file', maxCount: 1 },
  { name: 'other_supporting_documents', maxCount: 25 },
]);

// ── LS HR ───────────────────────────────────────────────────────────────────
router.get('/hr/submissions', authenticate, authorize('ls_hr'), listHrSubmissions);
router.get('/hr/submissions/:id/pdf', authenticate, authorize('ls_hr'), downloadSubmissionPdf);
router.get('/hr/submissions/:id/attachments', authenticate, authorize('ls_hr'), downloadSubmissionAttachments);
router.post('/hr/submissions/:id/approve', authenticate, authorize('ls_hr'), hrApprove);
router.post('/hr/submissions/:id/reject', authenticate, authorize('ls_hr'), hrReject);

// ── SSU ─────────────────────────────────────────────────────────────────────
router.get('/ssu/submissions', authenticate, authorize('ssu'), listSsuSubmissions);
router.get('/ssu/submissions/:id/pdf', authenticate, authorize('ssu'), downloadSubmissionPdf);
router.get('/ssu/submissions/:id/attachments', authenticate, authorize('ssu'), downloadSubmissionAttachments);
router.post('/ssu/submissions/:id/approve', authenticate, authorize('ssu'), ssuApprove);
router.post('/ssu/submissions/:id/reject', authenticate, authorize('ssu'), ssuReject);
router.post('/ssu/submissions/:id/mark-paid', authenticate, authorize('ssu'), ssuMarkPaid);

// ── Vendor (paths before generic :id if any) ────────────────────────────────
router.get('/vendor/summary', authenticate, authorize('vendor'), getVendorMonthlySummary);
router.get('/vendor/:month/:year/pdf', authenticate, authorize('vendor'), downloadVendorMonthlyPdf);
router.get('/vendor/:month/:year', authenticate, authorize('vendor'), getVendorMonthlyDetail);
router.post('/vendor/:month/:year', authenticate, authorize('vendor'), docFields, submitVendorMonthly);

module.exports = router;
