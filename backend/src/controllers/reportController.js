const db = require('../config/database');
const path = require('path');

// Vendor: list monthly summaries for all LS under this vendor
const getReportList = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    const { search, year, page = 1, limit = 20 } = req.query;

    if (!vendorId) {
      return res.status(403).json({ success: false, message: 'Vendor access only.' });
    }

    let where = 'WHERE u.vendor_id = ? AND u.role = "ls"';
    const params = [vendorId];

    if (search) {
      where += ' AND (u.name LIKE ? OR u.employee_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const targetYear = year || new Date().getFullYear();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get LS employees under this vendor with their monthly summaries
    const [rows] = await db.query(
      `SELECT
         u.id AS user_id,
         u.name AS employee_name,
         u.employee_id,
         m.report_month,
         m.report_year,
         m.id AS report_id,
         m.invoice_value,
         m.status AS report_status,
         m.submitted_at,
         (SELECT COUNT(*) FROM attendance a
          WHERE a.user_id = u.id
            AND YEAR(a.attendance_date) = ?
            AND a.status = 'approved') AS approved_days,
         (SELECT COUNT(*) FROM attendance a
          WHERE a.user_id = u.id
            AND YEAR(a.attendance_date) = ?) AS total_days
       FROM users u
       LEFT JOIN monthly_reports m
         ON m.user_id = u.id AND m.report_year = ?
       ${where}
       ORDER BY u.name, m.report_month
       LIMIT ? OFFSET ?`,
      [targetYear, targetYear, targetYear, ...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM users u ${where}`,
      params
    );

    res.json({ success: true, data: rows, pagination: { total, page: parseInt(page), limit: parseInt(limit) }, year: targetYear });
  } catch (err) {
    console.error('Report list error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Vendor: get detailed attendance for an LS for a specific month
const getReportDetail = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    const { userId, month, year } = req.params;

    // Verify LS belongs to vendor
    const [userCheck] = await db.query(
      'SELECT id, name, employee_id FROM users WHERE id = ? AND vendor_id = ? AND role = "ls"',
      [userId, vendorId]
    );
    if (userCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found under your vendor.' });
    }

    // Get attendance records
    const [attendance] = await db.query(
      `SELECT a.*, u.name AS employee_name, u.employee_id,
              app.name AS approver_name
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN users app ON a.approved_by = app.id
       WHERE a.user_id = ?
         AND MONTH(a.attendance_date) = ?
         AND YEAR(a.attendance_date) = ?
       ORDER BY a.attendance_date`,
      [userId, month, year]
    );

    // Get or initialize the monthly report record
    const [report] = await db.query(
      `SELECT * FROM monthly_reports
       WHERE vendor_id = ? AND user_id = ? AND report_month = ? AND report_year = ?`,
      [vendorId, userId, month, year]
    );

    res.json({
      success: true,
      employee: userCheck[0],
      attendance,
      report: report[0] || null,
      month: parseInt(month),
      year: parseInt(year),
    });
  } catch (err) {
    console.error('Report detail error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Vendor: submit monthly report (invoice + documents)
const submitReport = async (req, res) => {
  try {
    const vendorId = req.user.vendor_id;
    const submittedBy = req.user.id;
    const { userId, month, year } = req.params;
    const { invoice_value } = req.body;

    // Verify LS belongs to vendor
    const [userCheck] = await db.query(
      'SELECT id FROM users WHERE id = ? AND vendor_id = ? AND role = "ls"',
      [userId, vendorId]
    );
    if (userCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found under your vendor.' });
    }

    // Build file paths from uploaded files
    const files = req.files || {};
    const bastFile        = files.bast_file        ? files.bast_file[0].filename        : null;
    const invoiceFile     = files.invoice_file     ? files.invoice_file[0].filename     : null;
    const recapSalaryFile = files.recap_salary_file ? files.recap_salary_file[0].filename : null;
    const taxFile         = files.tax_file         ? files.tax_file[0].filename         : null;

    // Upsert the monthly_reports record
    const [existing] = await db.query(
      'SELECT id FROM monthly_reports WHERE vendor_id=? AND user_id=? AND report_month=? AND report_year=?',
      [vendorId, userId, month, year]
    );

    if (existing.length === 0) {
      await db.query(
        `INSERT INTO monthly_reports
           (vendor_id, user_id, report_month, report_year, invoice_value,
            bast_file, invoice_file, recap_salary_file, tax_file,
            submitted_by, submitted_at, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),'submitted')`,
        [vendorId, userId, month, year, invoice_value || null,
         bastFile, invoiceFile, recapSalaryFile, taxFile, submittedBy]
      );
    } else {
      const updates = [];
      const uParams = [];

      if (invoice_value !== undefined) { updates.push('invoice_value=?'); uParams.push(invoice_value); }
      if (bastFile)        { updates.push('bast_file=?');         uParams.push(bastFile); }
      if (invoiceFile)     { updates.push('invoice_file=?');      uParams.push(invoiceFile); }
      if (recapSalaryFile) { updates.push('recap_salary_file=?'); uParams.push(recapSalaryFile); }
      if (taxFile)         { updates.push('tax_file=?');          uParams.push(taxFile); }
      updates.push('submitted_by=?', 'submitted_at=NOW()', 'status="submitted"');
      uParams.push(submittedBy, existing[0].id);

      await db.query(
        `UPDATE monthly_reports SET ${updates.join(',')} WHERE id=?`,
        uParams
      );
    }

    res.json({ success: true, message: 'Monthly report submitted successfully.' });
  } catch (err) {
    console.error('Submit report error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getReportList, getReportDetail, submitReport };
