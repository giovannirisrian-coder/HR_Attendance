const db = require('../config/database');
const { normalizeCalendarYmdFromBody, compareYmd } = require('../utils/calendarDate');

const VALID_TYPES = ['cuti', 'izin', 'sakit'];

const inclusiveDays = (start, end) => {
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${end}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86400000) + 1;
};

const validateReasonForType = (type, reason) => {
  const r = reason === undefined || reason === null ? '' : String(reason).trim();
  if (type === 'izin' || type === 'sakit') {
    if (r.length < 5) {
      return 'Reason is required (at least 5 characters) for Izin and Sakit.';
    }
  }
  return null;
};

// LS: submit leave (type must be cuti | izin | sakit)
const createLeave = async (req, res) => {
  try {
    const userId = req.user.id;
    const { request_type, start_date, end_date, reason } = req.body;

    if (!request_type || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'request_type, start_date and end_date are required.',
      });
    }
    if (!VALID_TYPES.includes(request_type)) {
      return res.status(400).json({ success: false, message: 'Invalid request_type.' });
    }

    const startNorm = normalizeCalendarYmdFromBody(start_date);
    const endNorm = normalizeCalendarYmdFromBody(end_date);
    if (!startNorm.ok) {
      return res.status(400).json({ success: false, message: `start_date: ${startNorm.error}` });
    }
    if (!endNorm.ok) {
      return res.status(400).json({ success: false, message: `end_date: ${endNorm.error}` });
    }
    const startYmd = startNorm.ymd;
    const endYmd = endNorm.ymd;

    const days = inclusiveDays(startYmd, endYmd);
    if (days === null || days < 1) {
      return res.status(400).json({ success: false, message: 'Invalid date range.' });
    }
    if (compareYmd(startYmd, endYmd) > 0) {
      return res.status(400).json({ success: false, message: 'End date must be on or after start date.' });
    }

    const reasonErr = validateReasonForType(request_type, reason);
    if (reasonErr) {
      return res.status(400).json({ success: false, message: reasonErr });
    }

    const reasonTrim = reason === undefined || reason === null ? null : String(reason).trim() || null;

    const [ins] = await db.query(
      `INSERT INTO leave_requests (user_id, request_type, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [userId, request_type, startYmd, endYmd, reasonTrim]
    );

    const [rows] = await db.query(
      `SELECT lr.*, u.name AS employee_name, u.employee_id
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.id = ?`,
      [ins.insertId]
    );

    res.status(201).json({ success: true, message: 'Leave request submitted.', data: rows[0] });
  } catch (err) {
    console.error('Create leave error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// LS: list own requests — optional request_type filter (cuti | izin | sakit)
const getMyLeaves = async (req, res) => {
  try {
    const userId = req.user.id;
    const { request_type, status, page = 1, limit = 20 } = req.query;

    if (request_type && !VALID_TYPES.includes(request_type)) {
      return res.status(400).json({ success: false, message: 'Invalid request_type.' });
    }

    let where = 'WHERE lr.user_id = ?';
    const params = [userId];
    if (request_type) {
      where += ' AND lr.request_type = ?';
      params.push(request_type);
    }
    if (status) {
      where += ' AND lr.status = ?';
      params.push(status);
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rows] = await db.query(
      `SELECT lr.*, u.name AS employee_name, u.employee_id
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       ${where}
       ORDER BY lr.start_date DESC, lr.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM leave_requests lr ${where}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    });
  } catch (err) {
    console.error('Get my leaves error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Supervisor: team leave requests — optional request_type filter
const getTeamLeaves = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { request_type, search, status, page = 1, limit = 20 } = req.query;

    if (request_type && !VALID_TYPES.includes(request_type)) {
      return res.status(400).json({ success: false, message: 'Invalid request_type.' });
    }

    let where = 'WHERE u.supervisor_id = ?';
    const params = [supervisorId];
    if (request_type) {
      where += ' AND lr.request_type = ?';
      params.push(request_type);
    }

    if (search && String(search).trim()) {
      const t = `%${String(search).trim()}%`;
      where += ' AND (u.name LIKE ? OR u.employee_id LIKE ? OR lr.reason LIKE ?)';
      params.push(t, t, t);
    }
    if (status) {
      where += ' AND lr.status = ?';
      params.push(status);
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rows] = await db.query(
      `SELECT lr.*, u.name AS employee_name, u.employee_id,
              sup.name AS supervisor_name
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       LEFT JOIN users sup ON u.supervisor_id = sup.id
       ${where}
       ORDER BY lr.start_date DESC, lr.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       ${where}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    });
  } catch (err) {
    console.error('Get team leaves error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Supervisor: approve / reject (same pattern as attendance)
const updateLeaveApproval = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { id } = req.params;
    const { action, rejection_note } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'." });
    }

    const [rows] = await db.query(
      `SELECT lr.* FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.id = ? AND u.supervisor_id = ?`,
      [id, supervisorId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found or not under your supervision.',
      });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await db.query(
      `UPDATE leave_requests
       SET status = ?, approved_by = ?, approved_at = NOW(), rejection_note = ?
       WHERE id = ?`,
      [newStatus, supervisorId, rejection_note || null, id]
    );

    res.json({ success: true, message: `Leave request ${newStatus} successfully.` });
  } catch (err) {
    console.error('Leave approval error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  createLeave,
  getMyLeaves,
  getTeamLeaves,
  updateLeaveApproval,
};
