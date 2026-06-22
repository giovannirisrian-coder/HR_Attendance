const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { buildVendorMonthlyTimesheetPdf } = require('../services/pdfService');
const {
  fetchVendorMonthlyPdfData,
  fetchVendorAttendanceRowsForMonthlyPdf,
} = require('../services/vendorMonthlyPdfData');
const {
  parseVendorFileRef,
  parseOtherSupportingRefs,
} = require('../utils/vendorFileRef');
const {
  getVendorAttachmentReadStream,
  vendorAttachmentExists,
  parseStorageRef,
} = require('../services/gcsStorageService');

const DOCS_DIR = path.join(__dirname, '../../uploads/documents');

const sanitizeZipEntryName = (name, fallback) => {
  const base = path.basename(String(name || fallback || 'file'));
  return base.replace(/[^\w.\-() ]+/g, '_') || 'file';
};

async function appendVendorFileToArchive(archive, storedVal, zipBaseName) {
  const ref = parseVendorFileRef(storedVal);
  if (!ref) return;

  if (ref.legacyLocal) {
    const abs = path.join(DOCS_DIR, ref.path);
    if (fs.existsSync(abs)) {
      const ext = path.extname(ref.path) || path.extname(ref.name) || '.bin';
      archive.file(abs, { name: `${zipBaseName}${ext}` });
    }
    return;
  }

  const storageRef = parseStorageRef(ref.path);
  if (!storageRef) return;

  let exists = false;
  try {
    exists = await vendorAttachmentExists(ref.path);
  } catch {
    exists = false;
  }
  if (!exists) return;

  const entryName = ref.legacyLocal
    ? `${zipBaseName}${path.extname(ref.path) || path.extname(ref.name) || '.bin'}`
    : `${zipBaseName}_${sanitizeZipEntryName(ref.name, zipBaseName)}`;
  try {
    const stream = getVendorAttachmentReadStream(ref.path);
    archive.append(stream, { name: entryName });
  } catch (err) {
    console.warn('Zip skip file:', ref.path, err.message);
  }
}

async function fetchVendorAttendanceRows(vendorId, month, year) {
  return fetchVendorAttendanceRowsForMonthlyPdf(vendorId, month, year);
}

async function getSubmissionById(id) {
  const [rows] = await db.query(
    `SELECT s.*, v.name AS vendor_name, v.code AS vendor_code, v.close_book_date
     FROM vendor_monthly_submissions s
     JOIN vendors v ON s.vendor_id = v.id
     WHERE s.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/** LS HR + SSU: stream PDF for a submission */
const downloadSubmissionPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const sub = await getSubmissionById(id);
    if (!sub) return res.status(404).json({ success: false, message: 'Submission not found.' });

    const { rows, leaveRows, period } = await fetchVendorMonthlyPdfData(
      sub.vendor_id,
      sub.report_month,
      sub.report_year,
      sub.close_book_date
    );
    const doc = buildVendorMonthlyTimesheetPdf({
      vendor: { name: sub.vendor_name, code: sub.vendor_code },
      month: sub.report_month,
      year: sub.report_year,
      period,
      rows,
      leaveRows,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="timesheet-v${sub.vendor_id}-${sub.report_year}-${String(sub.report_month).padStart(2, '0')}.pdf"`
    );
    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error('PDF error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to generate PDF.' });
  }
};

/** Bulk download vendor-uploaded files */
const downloadSubmissionAttachments = async (req, res) => {
  try {
    const { id } = req.params;
    const sub = await getSubmissionById(id);
    if (!sub) return res.status(404).json({ success: false, message: 'Submission not found.' });

    const parseOtherSupporting = (val) => parseOtherSupportingRefs(val);

    const files = [
      { field: 'bast_file', label: 'BAST' },
      { field: 'invoice_file', label: 'Invoice' },
      { field: 'recap_salary_file', label: 'Recap_Salary' },
      { field: 'tax_file', label: 'Tax_Invoice' },
      { field: 'receipt_file', label: 'Receipt' },
    ];

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="vendor-submission-${id}-attachments.zip"`
    );
    archive.pipe(res);

    for (const f of files) {
      const stored = sub[f.field];
      if (!stored) continue;
      await appendVendorFileToArchive(archive, stored, f.label);
    }

    const others = parseOtherSupporting(sub.other_supporting_files);
    for (let i = 0; i < others.length; i += 1) {
      const item = others[i];
      const stored = item.legacyLocal ? item.path : { path: item.path, name: item.name };
      await appendVendorFileToArchive(archive, stored, `Other_Supporting_${i + 1}`);
    }

    archive.on('error', (e) => {
      console.error('Zip error:', e);
      if (!res.headersSent) res.status(500).end();
    });
    await archive.finalize();
  } catch (err) {
    console.error('Attachments zip error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to build archive.' });
  }
};

/** LS HR: list vendor monthly submissions */
const listHrSubmissions = async (req, res) => {
  try {
    const { month, year, vendor_search, status, page = 1, limit = 20 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (month) { where += ' AND s.report_month = ?'; params.push(parseInt(month, 10)); }
    if (year)  { where += ' AND s.report_year = ?';  params.push(parseInt(year, 10)); }
    if (vendor_search) {
      where += ' AND (v.name LIKE ? OR v.code LIKE ?)';
      params.push(`%${vendor_search}%`, `%${vendor_search}%`);
    }
    if (status === 'request_approval') {
      where += " AND s.workflow_status = 'pending_ls_hr'";
    } else if (status === 'approved') {
      where += " AND s.workflow_status IN ('pending_ssu','invoice_on_process','paid')";
    } else if (status === 'rejected') {
      where += " AND s.workflow_status = 'hr_rejected'";
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [rows] = await db.query(
      `SELECT s.*, v.name AS vendor_name, v.code AS vendor_code,
              u.name AS submitted_by_name
       FROM vendor_monthly_submissions s
       JOIN vendors v ON s.vendor_id = v.id
       LEFT JOIN users u ON s.submitted_by = u.id
       ${where}
       ORDER BY s.report_year DESC, s.report_month DESC, s.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM vendor_monthly_submissions s JOIN vendors v ON s.vendor_id = v.id ${where}`,
      params
    );

    res.json({ success: true, data: rows, pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) } });
  } catch (err) {
    console.error('listHrSubmissions:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** SSU: list submissions */
const listSsuSubmissions = async (req, res) => {
  try {
    const { month, year, vendor_id, vendor_search, status, page = 1, limit = 20 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (month) { where += ' AND s.report_month = ?'; params.push(parseInt(month, 10)); }
    if (year)  { where += ' AND s.report_year = ?';  params.push(parseInt(year, 10)); }
    if (vendor_id) { where += ' AND s.vendor_id = ?'; params.push(parseInt(vendor_id, 10)); }
    if (vendor_search) {
      where += ' AND (v.name LIKE ? OR v.code LIKE ?)';
      params.push(`%${vendor_search}%`, `%${vendor_search}%`);
    }
    if (status === 'request_approval') {
      where += " AND s.workflow_status = 'pending_ssu'";
    } else if (status === 'invoice_on_process') {
      where += " AND s.workflow_status = 'invoice_on_process'";
    } else if (status === 'paid') {
      where += " AND s.workflow_status = 'paid'";
    } else if (status === 'rejected') {
      where += " AND s.workflow_status = 'pending_ls_hr' AND s.ssu_rejection_note IS NOT NULL";
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [rows] = await db.query(
      `SELECT s.*, v.name AS vendor_name, v.code AS vendor_code,
              u.name AS submitted_by_name
       FROM vendor_monthly_submissions s
       JOIN vendors v ON s.vendor_id = v.id
       LEFT JOIN users u ON s.submitted_by = u.id
       ${where}
       ORDER BY s.report_year DESC, s.report_month DESC, s.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM vendor_monthly_submissions s JOIN vendors v ON s.vendor_id = v.id ${where}`,
      params
    );

    res.json({ success: true, data: rows, pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) } });
  } catch (err) {
    console.error('listSsuSubmissions:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const hrApprove = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM vendor_monthly_submissions WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    const s = rows[0];
    if (s.workflow_status !== 'pending_ls_hr') {
      return res.status(400).json({ success: false, message: 'Only submissions awaiting LS HR review can be approved.' });
    }
    await db.query(
      `UPDATE vendor_monthly_submissions
       SET workflow_status = 'pending_ssu',
           hr_reviewed_by = ?, hr_reviewed_at = NOW(),
           hr_rejection_note = NULL,
           ssu_rejection_note = NULL
       WHERE id = ?`,
      [req.user.id, id]
    );
    res.json({ success: true, message: 'Approved. Submitted to SSU queue.' });
  } catch (err) {
    console.error('hrApprove:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const hrReject = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ success: false, message: 'Rejection note is required.' });
    }
    const [rows] = await db.query('SELECT * FROM vendor_monthly_submissions WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    const s = rows[0];
    if (s.workflow_status !== 'pending_ls_hr') {
      return res.status(400).json({ success: false, message: 'Only pending LS HR items can be rejected.' });
    }
    await db.query(
      `UPDATE vendor_monthly_submissions
       SET workflow_status = 'hr_rejected',
           hr_reviewed_by = ?, hr_reviewed_at = NOW(),
           hr_rejection_note = ?
       WHERE id = ?`,
      [req.user.id, String(note).trim(), id]
    );
    res.json({ success: true, message: 'Rejected. Vendor may revise and resubmit.' });
  } catch (err) {
    console.error('hrReject:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const ssuApprove = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM vendor_monthly_submissions WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    const s = rows[0];
    if (s.workflow_status !== 'pending_ssu') {
      return res.status(400).json({ success: false, message: 'Only items pending SSU review can be approved.' });
    }
    await db.query(
      `UPDATE vendor_monthly_submissions
       SET workflow_status = 'invoice_on_process',
           ssu_reviewed_by = ?, ssu_reviewed_at = NOW(),
           ssu_rejection_note = NULL
       WHERE id = ?`,
      [req.user.id, id]
    );
    res.json({ success: true, message: 'Final approval recorded. Status: Invoice On Process.' });
  } catch (err) {
    console.error('ssuApprove:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const ssuReject = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ success: false, message: 'Rejection note is required.' });
    }
    const [rows] = await db.query('SELECT * FROM vendor_monthly_submissions WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    const s = rows[0];
    if (s.workflow_status !== 'pending_ssu') {
      return res.status(400).json({ success: false, message: 'Only pending SSU items can be rejected.' });
    }
    await db.query(
      `UPDATE vendor_monthly_submissions
       SET workflow_status = 'pending_ls_hr',
           ssu_reviewed_by = ?, ssu_reviewed_at = NOW(),
           ssu_rejection_note = ?
       WHERE id = ?`,
      [req.user.id, String(note).trim(), id]
    );
    res.json({ success: true, message: 'Returned to LS HR for review.' });
  } catch (err) {
    console.error('ssuReject:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const ssuMarkPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM vendor_monthly_submissions WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    const s = rows[0];
    if (s.workflow_status !== 'invoice_on_process') {
      return res.status(400).json({ success: false, message: 'Only Invoice On Process items can be marked as Paid.' });
    }
    await db.query(
      `UPDATE vendor_monthly_submissions
       SET workflow_status = 'paid',
           ssu_reviewed_by = ?, ssu_reviewed_at = NOW()
       WHERE id = ?`,
      [req.user.id, id]
    );
    res.json({ success: true, message: 'Status updated to Paid.' });
  } catch (err) {
    console.error('ssuMarkPaid:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  downloadSubmissionPdf,
  downloadSubmissionAttachments,
  listHrSubmissions,
  listSsuSubmissions,
  hrApprove,
  hrReject,
  ssuApprove,
  ssuReject,
  ssuMarkPaid,
  fetchVendorAttendanceRows,
  getSubmissionById,
};
