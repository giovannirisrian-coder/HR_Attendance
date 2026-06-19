const db = require('../config/database');
const {
  normalizeCloseBookDate,
  closeBookDateLabel,
  calcVendorReportDateRange,
  formatPeriodRangeLabel,
  serializeCloseBookDateForApi,
  serializeCloseBookDateForDb,
  CLOSE_BOOK_EOM,
} = require('../utils/vendorCloseBookDate');

function isValidCloseBookInput(val) {
  if (val == null || val === '') return false;
  const s = String(val).trim().toLowerCase();
  if (s === 'eom' || s === 'end_of_month' || s === 'end of the month' || s === 'end of month') {
    return true;
  }
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n >= 1 && n <= CLOSE_BOOK_EOM;
}

/** GET /api/reports/vendor/config */
const getVendorConfig = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    if (!vendorId) return res.status(403).json({ success: false, message: 'Vendor access only.' });

    const [[vendor]] = await db.query(
      'SELECT id, name, code, close_book_date FROM vendors WHERE id = ?',
      [vendorId]
    );
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const closeBookDate = normalizeCloseBookDate(vendor.close_book_date);
    const now = new Date();
    const exampleRange = calcVendorReportDateRange(closeBookDate, now.getMonth() + 1, now.getFullYear());

    res.json({
      success: true,
      vendor: {
        id: vendor.id,
        name: vendor.name,
        code: vendor.code,
        close_book_date: serializeCloseBookDateForApi(closeBookDate),
        close_book_date_label: closeBookDateLabel(closeBookDate),
      },
      example_period: {
        report_month: now.getMonth() + 1,
        report_year: now.getFullYear(),
        start_date: exampleRange.startDate,
        end_date: exampleRange.endDate,
        label: formatPeriodRangeLabel(exampleRange.startDate, exampleRange.endDate),
      },
    });
  } catch (err) {
    console.error('getVendorConfig:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** PUT /api/reports/vendor/config */
const updateVendorConfig = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    if (!vendorId) return res.status(403).json({ success: false, message: 'Vendor access only.' });

    const { close_book_date: raw } = req.body || {};
    if (!isValidCloseBookInput(raw)) {
      return res.status(400).json({
        success: false,
        message: 'close_book_date must be 1–27 or "eom".',
      });
    }

    const stored = serializeCloseBookDateForDb(raw);
    await db.query('UPDATE vendors SET close_book_date = ? WHERE id = ?', [stored, vendorId]);

    const [[vendor]] = await db.query(
      'SELECT id, name, code, close_book_date FROM vendors WHERE id = ?',
      [vendorId]
    );

    const closeBookDate = normalizeCloseBookDate(vendor.close_book_date);
    const now = new Date();
    const exampleRange = calcVendorReportDateRange(closeBookDate, now.getMonth() + 1, now.getFullYear());

    res.json({
      success: true,
      message: 'Configuration saved.',
      vendor: {
        id: vendor.id,
        name: vendor.name,
        code: vendor.code,
        close_book_date: serializeCloseBookDateForApi(closeBookDate),
        close_book_date_label: closeBookDateLabel(closeBookDate),
      },
      example_period: {
        report_month: now.getMonth() + 1,
        report_year: now.getFullYear(),
        start_date: exampleRange.startDate,
        end_date: exampleRange.endDate,
        label: formatPeriodRangeLabel(exampleRange.startDate, exampleRange.endDate),
      },
    });
  } catch (err) {
    console.error('updateVendorConfig:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getVendorConfig,
  updateVendorConfig,
};
