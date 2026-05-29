const db = require('../config/database');
const { normalizeCalendarYmdFromBody } = require('../utils/calendarDate');

/**
 * Decoupled Overtime workflow.
 *
 * - LS (employee) submits a row into `overtime_requests` with status=pending.
 * - LS Supervisor approves / rejects that row.
 * - On approve, the row is linked to the latest **approved** attendance entry
 *   for the same LS+date and the legacy `attendance.ot_*` columns are
 *   populated on that linked row so the Vendor / LS HR / SSU "Monthly Sheet"
 *   and "BAST" analytics keep aggregating overtime exactly as before.
 *
 * The sequential approval chain (LS → Supervisor → Vendor → LS HR → SSU) and
 * the underlying attendance schema are intentionally untouched.
 */

const HHMMSS = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const normalizeTime = (raw) => {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  const m = s.match(HHMMSS);
  if (!m) return null;
  const hh = m[1];
  const mm = m[2];
  const ss = m[3] || '00';
  return `${hh}:${mm}:${ss}`;
};

const timeToMinutes = (t) => {
  if (!t) return null;
  const [h, m] = String(t).slice(0, 5).split(':').map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
};

const normalizeRemarks = (raw) => {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s.length ? s.slice(0, 4000) : null;
};

/** Project SELECT for overtime list rows used by both LS and Supervisor views. */
const OVERTIME_LIST_SELECT = `
  o.id, o.user_id, o.request_date, o.start_time, o.end_time, o.remarks,
  o.status, o.approved_by, o.approved_at, o.rejection_note,
  o.linked_attendance_id, o.created_at, o.updated_at,
  u.name AS employee_name, u.employee_id,
  e.nik AS nik
`;

// LS: submit overtime request — status defaults to 'pending'
const createOvertime = async (req, res) => {
  try {
    const userId = req.user.id;
    const { request_date, start_time, end_time, remarks } = req.body;

    if (!request_date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: 'request_date, start_time and end_time are required.',
      });
    }

    const norm = normalizeCalendarYmdFromBody(request_date);
    if (!norm.ok) {
      return res.status(400).json({ success: false, message: norm.error });
    }
    const dateYmd = norm.ymd;

    const startNorm = normalizeTime(start_time);
    const endNorm = normalizeTime(end_time);
    if (!startNorm || !endNorm) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time. Use HH:MM (24-hour) format.',
      });
    }
    const startM = timeToMinutes(startNorm);
    const endM = timeToMinutes(endNorm);
    if (endM <= startM) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time.',
      });
    }

    const remarksNorm = normalizeRemarks(remarks);

    const [ins] = await db.query(
      `INSERT INTO overtime_requests (user_id, request_date, start_time, end_time, remarks, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [userId, dateYmd, startNorm, endNorm, remarksNorm]
    );

    const [rows] = await db.query(
      `SELECT ${OVERTIME_LIST_SELECT}
       FROM overtime_requests o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE o.id = ?`,
      [ins.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Overtime request submitted.',
      data: rows[0],
    });
  } catch (err) {
    console.error('Create overtime error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// LS: list own overtime requests
const getMyOvertimes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, start_date, end_date, page = 1, limit = 20 } = req.query;

    let where = 'WHERE o.user_id = ?';
    const params = [userId];

    if (status && ['pending', 'approved', 'rejected', 'cancelled', 'withdrawn'].includes(status)) {
      where += ' AND o.status = ?';
      params.push(status);
    }
    if (start_date) {
      where += ' AND o.request_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      where += ' AND o.request_date <= ?';
      params.push(end_date);
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rows] = await db.query(
      `SELECT ${OVERTIME_LIST_SELECT}
       FROM overtime_requests o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN employees e ON e.user_id = u.id
       ${where}
       ORDER BY o.request_date DESC, o.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM overtime_requests o
       ${where}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    });
  } catch (err) {
    console.error('Get my overtimes error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Supervisor: list overtime requests for supervised LS (with optional user_id, status, date range)
const getTeamOvertimes = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { user_id, status, start_date, end_date, search, page = 1, limit = 20 } = req.query;

    let where = 'WHERE u.supervisor_id = ?';
    const params = [supervisorId];

    const uid = parseInt(user_id, 10);
    if (Number.isInteger(uid) && uid > 0) {
      where += ' AND o.user_id = ?';
      params.push(uid);
    }
    if (status && ['pending', 'approved', 'rejected', 'cancelled', 'withdrawn'].includes(status)) {
      where += ' AND o.status = ?';
      params.push(status);
    } else if (!status) {
      // Managerial Review must never surface rows the LS has already
      // pulled back. Cancelled / withdrawn rows are intentionally hidden
      // from the default Supervisor queue, but stay queryable via an
      // explicit status filter.
      where += " AND o.status NOT IN ('cancelled', 'withdrawn')";
    }
    if (start_date) {
      where += ' AND o.request_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      where += ' AND o.request_date <= ?';
      params.push(end_date);
    }
    if (search && String(search).trim()) {
      const t = `%${String(search).trim()}%`;
      where +=
        ' AND (u.name LIKE ? OR u.employee_id LIKE ? OR COALESCE(e.nik, "") LIKE ? OR o.remarks LIKE ?)';
      params.push(t, t, t, t);
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rows] = await db.query(
      `SELECT ${OVERTIME_LIST_SELECT}
       FROM overtime_requests o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN employees e ON e.user_id = u.id
       ${where}
       ORDER BY o.request_date DESC, o.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM overtime_requests o
       JOIN users u ON o.user_id = u.id
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
    console.error('Get team overtimes error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Supervisor: approve / reject a single overtime row
const updateOvertimeApproval = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const supervisorId = req.user.id;
    const { id } = req.params;
    const { action, rejection_note } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res
        .status(400)
        .json({ success: false, message: "action must be 'approve' or 'reject'." });
    }

    const [rows] = await conn.query(
      `SELECT o.*
       FROM overtime_requests o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = ? AND u.supervisor_id = ?`,
      [id, supervisorId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Overtime request not found or not under your supervision.',
      });
    }

    const row = rows[0];
    if (row.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending overtime requests can be processed.',
      });
    }

    if (action === 'reject') {
      const note = rejection_note ? String(rejection_note).trim() : null;
      if (!note) {
        return res.status(400).json({
          success: false,
          message: 'rejection_note is required when rejecting.',
        });
      }
      await conn.query(
        `UPDATE overtime_requests
         SET status = 'rejected', approved_by = ?, approved_at = NOW(),
             rejection_note = ?, linked_attendance_id = NULL
         WHERE id = ?`,
        [supervisorId, note, id]
      );
      return res.json({
        success: true,
        message: 'Overtime request rejected.',
      });
    }

    // ── Approve flow: link to the latest approved attendance for this LS+date ──
    await conn.beginTransaction();

    const [attRows] = await conn.query(
      `SELECT id
       FROM attendance
       WHERE user_id = ? AND attendance_date = ? AND status = 'approved'
       ORDER BY COALESCE(approved_at, updated_at, created_at) DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [row.user_id, row.request_date]
    );

    if (attRows.length === 0) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message:
          'No approved attendance exists for this LS on the requested date. Approve the attendance record first, then approve the overtime so it can be linked.',
      });
    }

    const linkedAttendanceId = attRows[0].id;

    // Mirror times/summary onto the linked attendance row so the existing
    // analytics (Monthly Sheet, BAST, OT hours summary) keep working.
    await conn.query(
      `UPDATE attendance
       SET ot_start_time = ?, ot_end_time = ?, ot_summary = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [row.start_time, row.end_time, row.remarks, linkedAttendanceId]
    );

    await conn.query(
      `UPDATE overtime_requests
       SET status = 'approved', approved_by = ?, approved_at = NOW(),
           rejection_note = NULL, linked_attendance_id = ?
       WHERE id = ?`,
      [supervisorId, linkedAttendanceId, id]
    );

    await conn.commit();

    res.json({
      success: true,
      message: 'Overtime approved and linked to the latest approved attendance.',
      data: { linked_attendance_id: linkedAttendanceId },
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* no-op */
    }
    console.error('Overtime approval error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
  }
};

// LS: cancel a pending overtime request OR withdraw an already approved one.
//
// Cancel  (pending  → cancelled): row simply leaves the Supervisor queue.
// Withdraw(approved → withdrawn): unlink from the attendance row it had
//                                 populated and clear ot_start_time /
//                                 ot_end_time / ot_summary on that row so
//                                 the Vendor / LS HR / SSU analytics
//                                 (Monthly Sheet, BAST, OT hour summary)
//                                 stop counting this overtime — the
//                                 approval sequence itself stays untouched.
const cancelOrWithdrawOvertime = async (req, res) => {
  const action = req.body?.action === 'withdraw' ? 'withdraw' : 'cancel';
  const conn = await db.getConnection();
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [rows] = await conn.query(
      'SELECT * FROM overtime_requests WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Overtime request not found or does not belong to you.',
      });
    }
    const row = rows[0];

    if (action === 'cancel') {
      if (row.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only pending overtime requests can be cancelled.',
        });
      }
      await conn.query(
        `UPDATE overtime_requests
         SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [id]
      );
      return res.json({
        success: true,
        message: 'Overtime request cancelled.',
        data: { id: Number(id), status: 'cancelled' },
      });
    }

    if (row.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved overtime requests can be withdrawn.',
      });
    }

    await conn.beginTransaction();
    if (row.linked_attendance_id) {
      await conn.query(
        `UPDATE attendance
         SET ot_start_time = NULL, ot_end_time = NULL, ot_summary = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [row.linked_attendance_id]
      );
    }
    await conn.query(
      `UPDATE overtime_requests
       SET status = 'withdrawn', linked_attendance_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );
    await conn.commit();

    res.json({
      success: true,
      message: 'Overtime request withdrawn. Monthly Sheet / BAST will no longer count this overtime.',
      data: { id: Number(id), status: 'withdrawn' },
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* no-op */ }
    console.error('Cancel/withdraw overtime error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
  }
};

module.exports = {
  createOvertime,
  getMyOvertimes,
  getTeamOvertimes,
  updateOvertimeApproval,
  cancelOrWithdrawOvertime,
};
