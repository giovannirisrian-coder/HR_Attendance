const db = require('../config/database');
const { buildVendorMonthlyTimesheetPdf } = require('../services/pdfService');
const {
  fetchVendorMonthlyPdfData,
  fetchVendorAttendanceRowsForMonthlyPdf,
} = require('../services/vendorMonthlyPdfData');

async function fetchVendorAttendanceRows(vendorId, month, year) {
  return fetchVendorAttendanceRowsForMonthlyPdf(vendorId, month, year);
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
  if (val == null) return [];
  if (Array.isArray(val)) return val.filter((x) => typeof x === 'string');
  if (Buffer.isBuffer(val)) {
    try {
      const j = JSON.parse(val.toString('utf8'));
      return Array.isArray(j) ? j.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  if (typeof val === 'string') {
    try {
      const j = JSON.parse(val);
      return Array.isArray(j) ? j.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Vendor: one row per month – aggregated LS attendance + submission workflow */
const getVendorMonthlySummary = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    if (!vendorId) return res.status(403).json({ success: false, message: 'Vendor access only.' });

    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const now = new Date();
    const maxMonth = year < now.getFullYear() ? 12 : now.getMonth() + 1;

    const [[vendor]] = await db.query('SELECT id, name, code FROM vendors WHERE id = ?', [vendorId]);
    const [[{ ls_count }]] = await db.query(
      `SELECT COUNT(*) AS ls_count FROM users WHERE vendor_id = ? AND role = 'ls' AND is_active = 1`,
      [vendorId]
    );

    const data = [];
    for (let m = 1; m <= maxMonth; m++) {
      const [[agg]] = await db.query(
        `SELECT
           COUNT(a.id) AS attendance_rows,
           SUM(CASE WHEN a.status = 'approved' THEN 1 ELSE 0 END) AS approved_rows
         FROM attendance a
         JOIN users u ON a.user_id = u.id
         WHERE u.vendor_id = ? AND u.role = 'ls'
           AND MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?`,
        [vendorId, m, year]
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
        ls_count: ls_count || 0,
        attendance_rows: agg.attendance_rows || 0,
        approved_rows: agg.approved_rows || 0,
        submission_id: submission?.id || null,
        workflow_status: submission?.workflow_status || null,
        submitted_at: submission?.submitted_at || null,
        invoice_value: submission?.invoice_value ?? null,
      });
    }

    res.json({ success: true, vendor, year, data });
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

    const [[vendor]] = await db.query('SELECT id, name, code FROM vendors WHERE id = ?', [vendorId]);
    const [employees] = await db.query(
      `SELECT id, name, employee_id FROM users WHERE vendor_id = ? AND role = 'ls' AND is_active = 1 ORDER BY name`,
      [vendorId]
    );

    const employeesOut = [];
    for (const emp of employees) {
      const [att] = await db.query(
        `SELECT a.* FROM attendance a
         WHERE a.user_id = ? AND MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?
         ORDER BY a.attendance_date`,
        [emp.id, month, year]
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
      vendor,
      month,
      year,
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
    const taxFile = files.tax_invoice_file?.[0]?.filename || null;
    const invoiceFile = files.invoice_file?.[0]?.filename || null;
    const receiptFile = files.receipt_file?.[0]?.filename || null;
    const otherNew = (files.other_supporting_documents || []).map((f) => f.filename);

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
      const otherStored = JSON.stringify(otherNew);
      await db.query(
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
      if (otherNew.length) otherCombined = [...otherCombined, ...otherNew];

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
    const [[v]] = await db.query('SELECT name, code FROM vendors WHERE id = ?', [vendorId]);
    if (!v) return res.status(404).json({ success: false, message: 'Vendor not found.' });
    const { rows, leaveRows } = await fetchVendorMonthlyPdfData(vendorId, month, year);
    const doc = buildVendorMonthlyTimesheetPdf({
      vendor: { name: v.name, code: v.code },
      month,
      year,
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
