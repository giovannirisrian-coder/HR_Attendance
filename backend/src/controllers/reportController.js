const db = require('../config/database');
const { buildVendorMonthlyTimesheetPdf } = require('../services/pdfService');
const {
  fetchVendorMonthlyPdfData,
  fetchVendorAttendanceRowsForMonthlyPdf,
} = require('../services/vendorMonthlyPdfData');

async function fetchVendorAttendanceRows(vendorId, month, year) {
  return fetchVendorAttendanceRowsForMonthlyPdf(vendorId, month, year);
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

    const { invoice_value } = req.body;
    const files = req.files || {};
    const bastFile = files.bast_file?.[0]?.filename || null;
    const invoiceFile = files.invoice_file?.[0]?.filename || null;
    const recapSalaryFile = files.recap_salary_file?.[0]?.filename || null;
    const taxFile = files.tax_file?.[0]?.filename || null;

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
      await db.query(
        `INSERT INTO vendor_monthly_submissions
          (vendor_id, report_month, report_year, invoice_value,
           bast_file, invoice_file, recap_salary_file, tax_file,
           submitted_by, submitted_at, workflow_status)
         VALUES (?,?,?,?,?,?,?,?,?,NOW(),'pending_ls_hr')`,
        [
          vendorId, month, year, invoice_value || null,
          bastFile, invoiceFile, recapSalaryFile, taxFile, submittedBy,
        ]
      );
    } else {
      const ex = existing[0];
      const updates = [];
      const params = [];
      if (invoice_value !== undefined) {
        updates.push('invoice_value=?');
        params.push(invoice_value || null);
      }
      if (bastFile) { updates.push('bast_file=?'); params.push(bastFile); }
      if (invoiceFile) { updates.push('invoice_file=?'); params.push(invoiceFile); }
      if (recapSalaryFile) { updates.push('recap_salary_file=?'); params.push(recapSalaryFile); }
      if (taxFile) { updates.push('tax_file=?'); params.push(taxFile); }
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
