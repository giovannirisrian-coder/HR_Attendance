const db = require('../config/database');
const { buildVendorMonthlyTimesheetPdf } = require('../services/pdfService');
const {
  fetchVendorMonthlyPdfData,
  fetchVendorAttendanceRowsForMonthlyPdf,
  resolvePeriod,
} = require('../services/vendorMonthlyPdfData');
const {
  serializeCloseBookDateForApi,
  closeBookDateLabel,
  formatPeriodRangeLabel,
} = require('../utils/vendorCloseBookDate');
const {
  uploadVendorAttachment,
  isVendorAttachmentStorageConfigured,
  isProduction,
} = require('../services/gcsStorageService');
const {
  serializeVendorFileRef,
  parseOtherSupportingRefs,
} = require('../utils/vendorFileRef');
async function fetchVendorAttendanceRows(vendorId, month, year, closeBookDate) {
  return fetchVendorAttendanceRowsForMonthlyPdf(vendorId, month, year, closeBookDate);
}

/** IDR-style input: strips thousand separators (.) */
function parseIdrInput(val) {
  if (val == null || val === '') return 0;
  const s = String(val).replace(/\./g, '').replace(/,/g, '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function normalizeLineItems(raw) {
  let arr = [];
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  } else if (Array.isArray(raw)) arr = raw;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      description: String(x.description ?? '').trim(),
      amount: parseIdrInput(x.amount),
    }))
    .filter((x) => x.description !== '' || x.amount > 0);
}

function parseOtherSupportingStored(val) {
  return parseOtherSupportingRefs(val).map((r) =>
    r.legacyLocal ? r.path : { path: r.path, name: r.name }
  );
}

async function uploadVendorDocFile(file, vendorId) {
  const result = await uploadVendorAttachment({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    vendorId,
  });
  return serializeVendorFileRef({
    storagePath: result.storagePath,
    originalName: result.originalName,
  });
}

function submissionHasNewFiles(files) {
  if (!files) return false;
  return Boolean(
    files.tax_invoice_file?.[0]
    || files.invoice_file?.[0]
    || files.receipt_file?.[0]
    || (files.other_supporting_documents && files.other_supporting_documents.length > 0)
  );
}
/** Vendor: one row per month – aggregated LS attendance + submission workflow */
const getVendorMonthlySummary = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    if (!vendorId) return res.status(403).json({ success: false, message: 'Vendor access only.' });

    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const now = new Date();
    const maxMonth = year < now.getFullYear() ? 12 : now.getMonth() + 1;

    const [[vendor]] = await db.query(
      'SELECT id, name, code, close_book_date FROM vendors WHERE id = ?',
      [vendorId]
    );
    const closeBookDate = vendor?.close_book_date ?? 1;
    const [[{ ls_count }]] = await db.query(
      `SELECT COUNT(*) AS ls_count FROM users WHERE vendor_id = ? AND role = 'ls' AND is_active = 1`,
      [vendorId]
    );

    const data = [];
    for (let m = 1; m <= maxMonth; m++) {
      const period = resolvePeriod(closeBookDate, m, year);
      // `approved_rows` is the count of LATEST APPROVED attendance rows per
      // (user_id, attendance_date) so multiple correction attempts do not
      // double-count toward invoice / BAST. Cancelled / withdrawn rows are
      // excluded by `a.status = 'approved'`. `attendance_rows` excludes
      // those terminal cancellations from the headline figure too.
      const [[agg]] = await db.query(
        `SELECT
           SUM(CASE WHEN a.status IN ('pending','approved','rejected') THEN 1 ELSE 0 END) AS attendance_rows,
           SUM(CASE
                 WHEN a.status = 'approved'
                  AND a.id = (
                    SELECT MAX(a2.id) FROM attendance a2
                    WHERE a2.user_id = a.user_id
                      AND a2.attendance_date = a.attendance_date
                      AND a2.status = 'approved'
                  )
                 THEN 1 ELSE 0
               END) AS approved_rows
         FROM attendance a
         JOIN users u ON a.user_id = u.id
         WHERE u.vendor_id = ? AND u.role = 'ls'
           AND a.attendance_date >= ? AND a.attendance_date <= ?`,
        [vendorId, period.startDate, period.endDate]
      );

      const [subRows] = await db.query(
        `SELECT id, workflow_status, invoice_value, submitted_at
         FROM vendor_monthly_submissions
         WHERE vendor_id = ? AND report_month = ? AND report_year = ?`,
        [vendorId, m, year]
      );
      const submission = subRows[0] || null;

      data.push({
        report_month: m,
        report_year: year,
        period_start: period.startDate,
        period_end: period.endDate,
        period_label: formatPeriodRangeLabel(period.startDate, period.endDate),
        ls_count: ls_count || 0,
        attendance_rows: agg.attendance_rows || 0,
        approved_rows: agg.approved_rows || 0,
        submission_id: submission?.id || null,
        workflow_status: submission?.workflow_status || null,
        submitted_at: submission?.submitted_at || null,
        invoice_value: submission?.invoice_value ?? null,
      });
    }

    res.json({
      success: true,
      vendor: vendor
        ? {
            ...vendor,
            close_book_date: serializeCloseBookDateForApi(vendor.close_book_date),
            close_book_date_label: closeBookDateLabel(vendor.close_book_date),
          }
        : null,
      year,
      data,
    });
  } catch (err) {
    console.error('getVendorMonthlySummary:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** Vendor: consolidated month detail – all LS + optional submission */
const getVendorMonthlyDetail = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    if (!vendorId) return res.status(403).json({ success: false, message: 'Vendor access only.' });

    const month = parseInt(req.params.month, 10);
    const year = parseInt(req.params.year, 10);
    if (month < 1 || month > 12 || !year) {
      return res.status(400).json({ success: false, message: 'Invalid month or year.' });
    }

    const [[vendor]] = await db.query(
      'SELECT id, name, code, close_book_date FROM vendors WHERE id = ?',
      [vendorId]
    );
    const closeBookDate = vendor?.close_book_date ?? 1;
    const [employees] = await db.query(
      `SELECT id, name, employee_id FROM users WHERE vendor_id = ? AND role = 'ls' AND is_active = 1 ORDER BY name`,
      [vendorId]
    );

    const period = resolvePeriod(closeBookDate, month, year);

    const employeesOut = [];
    for (const emp of employees) {
      // Show one timeline line per (employee, date): the LATEST APPROVED row
      // if one exists, otherwise the freshest pending / rejected row so the
      // vendor can still see what's outstanding. Cancelled / withdrawn rows
      // are intentionally suppressed.
      const [att] = await db.query(
        `SELECT a.* FROM attendance a
         WHERE a.user_id = ? AND a.attendance_date >= ? AND a.attendance_date <= ?
           AND a.status NOT IN ('cancelled', 'withdrawn', 'superseded')
           AND a.id = (
             SELECT MAX(a2.id) FROM attendance a2
             WHERE a2.user_id = a.user_id
               AND a2.attendance_date = a.attendance_date
               AND a2.status NOT IN ('cancelled', 'withdrawn', 'superseded')
               AND (
                 a2.status = 'approved'
                 OR NOT EXISTS (
                   SELECT 1 FROM attendance a3
                   WHERE a3.user_id = a.user_id
                     AND a3.attendance_date = a.attendance_date
                     AND a3.status = 'approved'
                 )
               )
           )
         ORDER BY a.attendance_date`,
        [emp.id, period.startDate, period.endDate]
      );
      employeesOut.push({ ...emp, attendance: att });
    }

    const [subRows] = await db.query(
      `SELECT * FROM vendor_monthly_submissions
       WHERE vendor_id = ? AND report_month = ? AND report_year = ?`,
      [vendorId, month, year]
    );
    const submission = subRows[0] || null;

    res.json({
      success: true,
      vendor: vendor
        ? {
            ...vendor,
            close_book_date: serializeCloseBookDateForApi(vendor.close_book_date),
            close_book_date_label: closeBookDateLabel(vendor.close_book_date),
          }
        : null,
      month,
      year,
      period: {
        start_date: period.startDate,
        end_date: period.endDate,
        label: formatPeriodRangeLabel(period.startDate, period.endDate),
      },
      submission,
      employees: employeesOut,
    });
  } catch (err) {
    console.error('getVendorMonthlyDetail:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const VENDOR_EDITABLE = ['draft', 'hr_rejected'];

/** Vendor: submit monthly package → LS HR queue */
const submitVendorMonthly = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    const submittedBy = req.user.id;
    const month = parseInt(req.params.month, 10);
    const year = parseInt(req.params.year, 10);
    if (month < 1 || month > 12 || !year) {
      return res.status(400).json({ success: false, message: 'Invalid month or year.' });
    }

    const { invoice_number, invoice_date, due_days, invoice_line_items, pph_amount: pphBody } = req.body;
    const files = req.files || {};

    if (submissionHasNewFiles(files) && !isVendorAttachmentStorageConfigured()) {
      const message = isProduction()
        ? 'File storage is not configured for production. Contact your administrator.'
        : 'File storage is not configured. Contact your administrator.';
      return res.status(503).json({ success: false, message });
    }

    let taxFile = null;
    let invoiceFile = null;
    let receiptFile = null;
    let otherNew = [];

    try {
      if (files.tax_invoice_file?.[0]) {
        taxFile = await uploadVendorDocFile(files.tax_invoice_file[0], vendorId);
      }
      if (files.invoice_file?.[0]) {
        invoiceFile = await uploadVendorDocFile(files.invoice_file[0], vendorId);
      }
      if (files.receipt_file?.[0]) {
        receiptFile = await uploadVendorDocFile(files.receipt_file[0], vendorId);
      }
      if (files.other_supporting_documents?.length) {
        otherNew = await Promise.all(
          files.other_supporting_documents.map((f) => uploadVendorDocFile(f, vendorId))
        );
      }
    } catch (uploadErr) {
      console.error('Vendor attachment upload error:', uploadErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload one or more documents. Please try again.',
      });
    }
    const lineItemsNorm = normalizeLineItems(invoice_line_items);
    const subtotal = lineItemsNorm.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const pphVal = parseIdrInput(pphBody);
    const totalInvoice = Math.round((subtotal + pphVal) * 100) / 100;

    const invNo = invoice_number != null ? String(invoice_number).trim() : null;
    const invDate = invoice_date != null && String(invoice_date).trim() !== '' ? String(invoice_date).trim() : null;
    const dueDaysStr = due_days != null && String(due_days).trim() !== '' ? String(due_days).trim() : null;

    const [existing] = await db.query(
      'SELECT * FROM vendor_monthly_submissions WHERE vendor_id = ? AND report_month = ? AND report_year = ?',
      [vendorId, month, year]
    );

    if (existing.length) {
      const st = existing[0].workflow_status;
      if (!VENDOR_EDITABLE.includes(st)) {
        return res.status(409).json({
          success: false,
          message: 'This period is locked for editing. Wait for LS HR / SSU workflow or contact support.',
        });
      }
    }

    if (existing.length === 0) {
      const otherStored = JSON.stringify(
        otherNew.map((s) => JSON.parse(s))
      );      await db.query(
        `INSERT INTO vendor_monthly_submissions
          (vendor_id, report_month, report_year, invoice_value,
           invoice_number, invoice_date, due_days, invoice_line_items, pph_amount,
           tax_file, invoice_file, receipt_file, other_supporting_files,
           submitted_by, submitted_at, workflow_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),'pending_ls_hr')`,
        [
          vendorId,
          month,
          year,
          totalInvoice,
          invNo || null,
          invDate || null,
          dueDaysStr || null,
          JSON.stringify(lineItemsNorm),
          pphVal,
          taxFile,
          invoiceFile,
          receiptFile,
          otherStored,
          submittedBy,
        ]
      );
    } else {
      const ex = existing[0];
      let otherCombined = parseOtherSupportingStored(ex.other_supporting_files);
      if (otherNew.length) {
        otherCombined = [...otherCombined, ...otherNew.map((s) => JSON.parse(s))];
      }
      const updates = [
        'invoice_value=?',
        'invoice_number=?',
        'invoice_date=?',
        'due_days=?',
        'invoice_line_items=?',
        'pph_amount=?',
        'other_supporting_files=?',
      ];
      const params = [
        totalInvoice,
        invNo || null,
        invDate || null,
        dueDaysStr || null,
        JSON.stringify(lineItemsNorm),
        pphVal,
        JSON.stringify(otherCombined),
      ];
      if (taxFile) {
        updates.push('tax_file=?');
        params.push(taxFile);
      }
      if (invoiceFile) {
        updates.push('invoice_file=?');
        params.push(invoiceFile);
      }
      if (receiptFile) {
        updates.push('receipt_file=?');
        params.push(receiptFile);
      }
      updates.push("workflow_status='pending_ls_hr'");
      updates.push('submitted_by=?');
      updates.push('submitted_at=NOW()');
      updates.push('hr_rejection_note=NULL');
      updates.push('ssu_rejection_note=NULL');
      params.push(submittedBy, ex.id);
      await db.query(
        `UPDATE vendor_monthly_submissions SET ${updates.join(', ')} WHERE id=?`,
        params
      );
    }
    res.json({ success: true, message: 'Submitted to LS HR for review.' });
  } catch (err) {
    console.error('submitVendorMonthly:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** Vendor: PDF without requiring a submission row */
const downloadVendorMonthlyPdf = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    if (!vendorId) return res.status(403).json({ success: false, message: 'Vendor access only.' });
    const month = parseInt(req.params.month, 10);
    const year = parseInt(req.params.year, 10);
    const [[v]] = await db.query(
      'SELECT name, code, close_book_date FROM vendors WHERE id = ?',
      [vendorId]
    );
    if (!v) return res.status(404).json({ success: false, message: 'Vendor not found.' });
    const { rows, leaveRows, period } = await fetchVendorMonthlyPdfData(
      vendorId,
      month,
      year,
      v.close_book_date
    );
    const doc = buildVendorMonthlyTimesheetPdf({
      vendor: { name: v.name, code: v.code },
      month,
      year,
      period,
      rows,
      leaveRows,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="timesheet-v${vendorId}-${year}-${String(month).padStart(2, '0')}.pdf"`
    );
    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error('downloadVendorMonthlyPdf:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to generate PDF.' });
  }
};

module.exports = {
  getVendorMonthlySummary,
  getVendorMonthlyDetail,
  submitVendorMonthly,
  downloadVendorMonthlyPdf,
  fetchVendorAttendanceRows,
};
