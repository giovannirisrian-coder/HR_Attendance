const multer = require('multer');

const vendorDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).fields([
  { name: 'tax_invoice_file', maxCount: 1 },
  { name: 'invoice_file', maxCount: 1 },
  { name: 'receipt_file', maxCount: 1 },
  { name: 'other_supporting_documents', maxCount: 25 },
]);

const handleVendorDocUpload = (req, res, next) => {
  vendorDocUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Each file must be 10 MB or smaller.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ success: false, message: 'Unexpected file field in upload.' });
    }
    return res.status(400).json({ success: false, message: err.message || 'Invalid file upload.' });
  });
};

module.exports = { handleVendorDocUpload };
