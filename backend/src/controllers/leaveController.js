const db = require('../config/database');
const { normalizeCalendarYmdFromBody, compareYmd } = require('../utils/calendarDate');

const VALID_TYPES = ['cuti', 'izin', 'sakit'];

/** Resolve calendar month bounds (local server date if year/month omitted). */
const resolveCalendarMonth = (req) => {
  const now = new Date();
  const qYear = parseInt(req.query.year, 10);
  const qMonth = parseInt(req.query.month, 10);
  const year = Number.isInteger(qYear) && qYear >= 2000 && qYear <= 2100 ? qYear : now.getFullYear();
  const month = Number.isInteger(qMonth) && qMonth >= 1 && qMonth <= 12 ? qMonth : now.getMonth() + 1;
  const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastD = new Date(year, month, 0).getDate();
  const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastD).padStart(2, '0')}`;
  return { year, month, startStr, endStr };
};

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

// Supervisor: counts for team leave requests overlapping a calendar month
const getTeamLeavesMonthStats = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { year, month, startStr, endStr } = resolveCalendarMonth(req);

    const [[row]] = await db.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN lr.status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN lr.status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN lr.status = 'rejected' THEN 1 ELSE 0 END) AS rejected
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE u.supervisor_id = ?
         AND lr.start_date <= ?
         AND lr.end_date >= ?`,
      [supervisorId, endStr, startStr]
    );

    res.json({
      success: true,
      data: {
        year,
        month,
        total: Number(row.total) || 0,
        pending: Number(row.pending) || 0,
        approved: Number(row.approved) || 0,
        rejected: Number(row.rejected) || 0,
      },
    });
  } catch (err) {
    console.error('Team leaves month stats error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Supervisor: per-LS counts for leave overlapping a calendar month
const getTeamLeavesEmployeesOverview = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { year, month, startStr, endStr } = resolveCalendarMonth(req);
    const searchRaw = req.query.search;
    const search = searchRaw && String(searchRaw).trim() ? String(searchRaw).trim() : '';

    let userWhere = 'WHERE u.supervisor_id = ? AND u.role = ?';
    const userParams = [supervisorId, 'ls'];
    if (search) {
      const t = `%${search}%`;
      userWhere += ' AND (u.name LIKE ? OR u.employee_id LIKE ? OR e.nik LIKE ?)';
      userParams.push(t, t, t);
    }

    const [rows] = await db.query(
      `SELECT
         u.id AS user_id,
         u.name AS employee_name,
         u.employee_id,
         MAX(e.nik) AS nik,
         COUNT(lr.id) AS total,
         SUM(CASE WHEN lr.status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN lr.status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN lr.status = 'rejected' THEN 1 ELSE 0 END) AS rejected
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN leave_requests lr
         ON lr.user_id = u.id
        AND lr.start_date <= ?
        AND lr.end_date >= ?
       ${userWhere}
       GROUP BY u.id, u.name, u.employee_id
       ORDER BY u.name ASC`,
      [endStr, startStr, ...userParams]
    );

    res.json({
      success: true,
      data: rows.map((r) => ({
        user_id: r.user_id,
        employee_name: r.employee_name,
        employee_id: r.employee_id,
        nik: r.nik || null,
        total: Number(r.total) || 0,
        pending: Number(r.pending) || 0,
        approved: Number(r.approved) || 0,
        rejected: Number(r.rejected) || 0,
      })),
      meta: { year, month },
    });
  } catch (err) {
    console.error('Team leaves employees overview error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Supervisor: team leave requests — optional request_type filter
const getTeamLeaves = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { request_type, search, status, page = 1, limit = 20, start_date, end_date } = req.query;

    if (request_type && !VALID_TYPES.includes(request_type)) {
      return res.status(400).json({ success: false, message: 'Invalid request_type.' });
    }

    let where = 'WHERE u.supervisor_id = ?';
    const params = [supervisorId];
    if (request_type) {
      where += ' AND lr.request_type = ?';
      params.push(request_type);
    }

    const uid = parseInt(user_id, 10);
    if (Number.isInteger(uid) && uid > 0) {
      where += ' AND lr.user_id = ?';
      params.push(uid);
    }

    if (start_date && end_date) {
      where += ' AND lr.start_date <= ? AND lr.end_date >= ?';
      params.push(end_date, start_date);
    }

    if (search && String(search).trim()) {
      const t = `%${String(search).trim()}%`;
      where +=
        ' AND (u.name LIKE ? OR u.employee_id LIKE ? OR lr.reason LIKE ? OR COALESCE(e.nik, "") LIKE ?)';
      params.push(t, t, t, t);
    }
    if (status) {
      where += ' AND lr.status = ?';
      params.push(status);
    }

    const ns = normalizeCalendarYmdFromBody(start_date);
    const ne = normalizeCalendarYmdFromBody(end_date);
    const fs = start_date && String(start_date).trim() && ns.ok ? ns.ymd : null;
    const fe = end_date && String(end_date).trim() && ne.ok ? ne.ymd : null;
    if (fs && fe) {
      if (compareYmd(fs, fe) > 0) {
        return res.status(400).json({
          success: false,
          message: 'start_date must be on or before end_date.',
        });
      }
      where += ' AND lr.start_date <= ? AND lr.end_date >= ?';
      params.push(fe, fs);
    } else if (fs) {
      where += ' AND lr.end_date >= ?';
      params.push(fs);
    } else if (fe) {
      where += ' AND lr.start_date <= ?';
      params.push(fe);
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rows] = await db.query(
      `SELECT lr.*, u.name AS employee_name, u.employee_id,
              sup.name AS supervisor_name,
              e.nik AS nik
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       LEFT JOIN users sup ON u.supervisor_id = sup.id
       LEFT JOIN employees e ON e.user_id = u.id
       ${where}
       ORDER BY lr.start_date DESC, lr.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       LEFT JOIN employees e ON e.user_id = u.id
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

// Supervisor: bulk approve / reject pending leave requests under supervision
const updateLeaveApprovalBulk = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const supervisorId = req.user.id;
    const { leave_ids, action, rejection_note } = req.body;

    if (!Array.isArray(leave_ids) || leave_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'leave_ids is required and must be a non-empty array.' });
    }
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'." });
    }

    const ids = [...new Set(leave_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid leave ids were provided.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const [ownedRows] = await conn.query(
      `SELECT lr.id
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.id IN (${placeholders}) AND u.supervisor_id = ?`,
      [...ids, supervisorId]
    );
    const ownedIds = new Set(ownedRows.map((r) => Number(r.id)));
    if (ownedIds.size !== ids.length) {
      return res.status(403).json({
        success: false,
        message: 'Some selected requests are not under your supervision.',
      });
    }

    const [pendingRows] = await conn.query(
      `SELECT id FROM leave_requests WHERE id IN (${placeholders}) AND status = 'pending'`,
      ids
    );
    const pendingIds = pendingRows.map((r) => Number(r.id));
    if (pendingIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending requests were selected. Only pending requests can be processed.',
      });
    }

    if (action === 'reject' && !(rejection_note && String(rejection_note).trim())) {
      return res.status(400).json({
        success: false,
        message: 'rejection_note is required when rejecting.',
      });
    }

    const pendingPlaceholders = pendingIds.map(() => '?').join(',');
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const noteValue = action === 'reject' ? String(rejection_note).trim() : null;

    await conn.beginTransaction();
    await conn.query(
      `UPDATE leave_requests
       SET status = ?, approved_by = ?, approved_at = NOW(), rejection_note = ?
       WHERE id IN (${pendingPlaceholders})`,
      [newStatus, supervisorId, noteValue, ...pendingIds]
    );
    await conn.commit();

    res.json({
      success: true,
      message: `${pendingIds.length} leave request(s) ${newStatus} successfully.`,
      data: {
        processed_ids: pendingIds,
        skipped_count: ids.length - pendingIds.length,
      },
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* no-op */
    }
    console.error('Leave bulk approval error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
  }
};

module.exports = {
  createLeave,
  getMyLeaves,
  getTeamLeaves,
  getTeamLeavesMonthStats,
  getTeamLeavesEmployeesOverview,
  updateLeaveApproval,
  updateLeaveApprovalBulk,
};
