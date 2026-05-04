const db = require('../config/database');
const {
  normalizeCalendarYmdFromBody,
  getAttendanceYmdBounds,
  assertYmdInInclusiveRange,
} = require('../utils/calendarDate');

const assertAttendanceDateInLsWindow = (ymd) => {
  const { minYmd, maxYmd } = getAttendanceYmdBounds();
  return assertYmdInInclusiveRange(
    ymd,
    minYmd,
    maxYmd,
    'Attendance date must be between 10 days ago and today (inclusive).'
  );
};

const fetchEmployeeProfileForUser = async (userId) => {
  const [rows] = await db.query(
    'SELECT id AS employee_id, nik FROM employees WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
};

/** Normalize to 16-digit string (digits only) or null if empty. */
const normalizeNik = (raw) => {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/\D/g, '');
  return s.length ? s : null;
};

const validateNikOrError = (normalizedNik) => {
  if (!normalizedNik || normalizedNik.length !== 16) {
    return 'NIK must be exactly 16 digits.';
  }
  return null;
};

const timeToMinutes = (t) => {
  if (t === undefined || t === null || t === '') return null;
  const s = String(t).slice(0, 8);
  const [h, m, sec] = s.split(':').map((x) => parseInt(x, 10) || 0);
  return h * 60 + m + sec / 60;
};

const normalizeOtSummary = (raw) => {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s.length ? s.slice(0, 4000) : null;
};

// LS: save overtime range for a day (same row + same approval flow as attendance)
const saveMyOvertime = async (req, res) => {
  try {
    const userId = req.user.id;
    const { attendance_date, ot_start_time, ot_end_time, ot_summary } = req.body;

    if (!attendance_date || !ot_start_time || !ot_end_time) {
      return res.status(400).json({
        success: false,
        message: 'attendance_date, ot_start_time and ot_end_time are required.',
      });
    }

    const normDate = normalizeCalendarYmdFromBody(attendance_date);
    if (!normDate.ok) {
      return res.status(400).json({ success: false, message: normDate.error });
    }
    const attendanceYmd = normDate.ymd;
    const dateErr = assertAttendanceDateInLsWindow(attendanceYmd);
    if (dateErr) {
      return res.status(400).json({ success: false, message: dateErr });
    }

    const startM = timeToMinutes(ot_start_time);
    const endM = timeToMinutes(ot_end_time);
    if (startM === null || endM === null) {
      return res.status(400).json({ success: false, message: 'Invalid overtime times.' });
    }
    if (endM <= startM) {
      return res.status(400).json({ success: false, message: 'Overtime end time must be after start time.' });
    }

    const summary = normalizeOtSummary(ot_summary);

    const [existing] = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND attendance_date = ?',
      [userId, attendanceYmd]
    );

    if (existing.length === 0 || !existing[0].clock_in_time) {
      return res.status(400).json({
        success: false,
        message: 'Clock in is required before overtime can be saved for this date.',
      });
    }
    if (existing[0].status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Overtime can only be changed while the attendance record is pending.',
      });
    }

    await db.query(
      `UPDATE attendance
       SET ot_start_time = ?, ot_end_time = ?, ot_summary = ?
       WHERE user_id = ? AND attendance_date = ?`,
      [ot_start_time, ot_end_time, summary, userId, attendanceYmd]
    );

    const [updated] = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND attendance_date = ?',
      [userId, attendanceYmd]
    );

    res.json({ success: true, message: 'Overtime saved.', data: updated[0] });
  } catch (err) {
    console.error('Save overtime error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// LS: create or update today's attendance (clock in / clock out)
const createAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      type,           // 'clock_in' | 'clock_out'
      attendance_date,
      time,
      latitude,
      longitude,
      address,
    } = req.body;

    if (!type || !attendance_date || !time) {
      return res.status(400).json({ success: false, message: 'type, attendance_date and time are required.' });
    }

    const normDate = normalizeCalendarYmdFromBody(attendance_date);
    if (!normDate.ok) {
      return res.status(400).json({ success: false, message: normDate.error });
    }
    const attendanceYmd = normDate.ymd;
    const dateErr = assertAttendanceDateInLsWindow(attendanceYmd);
    if (dateErr) {
      return res.status(400).json({ success: false, message: dateErr });
    }

    const emp = await fetchEmployeeProfileForUser(userId);
    if (!emp) {
      return res.status(400).json({
        success: false,
        message:
          'Profil karyawan dengan NIK belum ditemukan. Akun harus ditautkan ke master karyawan (employees). Hubungi HR.',
      });
    }
    const nikNorm = normalizeNik(emp.nik);
    const nikErr = validateNikOrError(nikNorm);
    if (nikErr) {
      return res.status(400).json({
        success: false,
        message: 'NIK pada master karyawan tidak valid (harus 16 digit). Hubungi HR.',
      });
    }
    const employeeId = emp.employee_id;

    const [existing] = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND attendance_date = ?',
      [userId, attendanceYmd]
    );

    if (type === 'clock_in') {
      if (existing.length > 0 && existing[0].clock_in_time) {
        return res.status(409).json({ success: false, message: 'Clock-in already recorded for this date.' });
      }

      if (existing.length === 0) {
        await db.query(
          `INSERT INTO attendance
            (user_id, employee_id, nik, attendance_date, clock_in_time, clock_in_lat, clock_in_lng, clock_in_address, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [userId, employeeId, nikNorm, attendanceYmd, time, latitude || null, longitude || null, address || null]
        );
      } else {
        await db.query(
          `UPDATE attendance SET employee_id=?, nik=?, clock_in_time=?, clock_in_lat=?, clock_in_lng=?, clock_in_address=?
           WHERE user_id=? AND attendance_date=?`,
          [employeeId, nikNorm, time, latitude || null, longitude || null, address || null, userId, attendanceYmd]
        );
      }
    } else if (type === 'clock_out') {
      if (existing.length === 0) {
        return res.status(400).json({ success: false, message: 'No clock-in found for this date.' });
      }
      if (existing[0].clock_out_time) {
        return res.status(409).json({ success: false, message: 'Clock-out already recorded for this date.' });
      }

      await db.query(
        `UPDATE attendance SET clock_out_time=?, clock_out_lat=?, clock_out_lng=?, clock_out_address=?, nik=?, employee_id=?
         WHERE user_id=? AND attendance_date=?`,
        [time, latitude || null, longitude || null, address || null, nikNorm, employeeId, userId, attendanceYmd]
      );
    } else {
      return res.status(400).json({ success: false, message: "type must be 'clock_in' or 'clock_out'." });
    }

    const [updated] = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND attendance_date = ?',
      [userId, attendanceYmd]
    );

    res.json({ success: true, message: `${type === 'clock_in' ? 'Clock-in' : 'Clock-out'} recorded.`, data: updated[0] });
  } catch (err) {
    console.error('Create attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// LS: list own attendance
const getMyAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { search, start_date, end_date, page = 1, limit = 20 } = req.query;

    let where = 'WHERE a.user_id = ?';
    const params = [userId];

    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      where += ' AND (DATE_FORMAT(a.attendance_date, "%Y-%m-%d") LIKE ? OR COALESCE(e.nik, a.nik) LIKE ?)';
      params.push(term, term);
    }
    if (start_date) { where += ' AND a.attendance_date >= ?'; params.push(start_date); }
    if (end_date)   { where += ' AND a.attendance_date <= ?'; params.push(end_date); }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const leaveDayTypeExpr = `CASE
      WHEN EXISTS (
        SELECT 1 FROM leave_requests lr
        WHERE lr.user_id = a.user_id AND lr.status = 'approved' AND lr.request_type = 'cuti'
          AND a.attendance_date BETWEEN lr.start_date AND lr.end_date
      ) THEN 'cuti'
      WHEN EXISTS (
        SELECT 1 FROM leave_requests lr
        WHERE lr.user_id = a.user_id AND lr.status = 'approved' AND lr.request_type = 'izin'
          AND a.attendance_date BETWEEN lr.start_date AND lr.end_date
      ) THEN 'izin'
      WHEN EXISTS (
        SELECT 1 FROM leave_requests lr
        WHERE lr.user_id = a.user_id AND lr.status = 'approved' AND lr.request_type = 'sakit'
          AND a.attendance_date BETWEEN lr.start_date AND lr.end_date
      ) THEN 'sakit'
      ELSE NULL
    END`;

    const [rows] = await db.query(
      `SELECT a.*, u.name AS employee_name, u.employee_id,
              (${leaveDayTypeExpr}) AS leave_day_type
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN employees e ON e.id = a.employee_id
       ${where}
       ORDER BY a.attendance_date DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN employees e ON e.id = a.employee_id
       ${where}`,
      params
    );

    const [[summaryRow]] = await db.query(
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN a.ot_start_time IS NOT NULL AND a.ot_end_time IS NOT NULL
             THEN TIME_TO_SEC(TIMEDIFF(a.ot_end_time, a.ot_start_time)) / 3600
             ELSE 0
           END
         ), 0) AS overtime_hours,
         COUNT(DISTINCT CASE
           WHEN EXISTS (
             SELECT 1 FROM leave_requests lr
             WHERE lr.user_id = a.user_id AND lr.status = 'approved' AND lr.request_type = 'cuti'
               AND a.attendance_date BETWEEN lr.start_date AND lr.end_date
           ) THEN a.attendance_date END) AS cuti_days,
         COUNT(DISTINCT CASE
           WHEN EXISTS (
             SELECT 1 FROM leave_requests lr
             WHERE lr.user_id = a.user_id AND lr.status = 'approved' AND lr.request_type = 'izin'
               AND a.attendance_date BETWEEN lr.start_date AND lr.end_date
           ) THEN a.attendance_date END) AS izin_days,
         COUNT(DISTINCT CASE
           WHEN EXISTS (
             SELECT 1 FROM leave_requests lr
             WHERE lr.user_id = a.user_id AND lr.status = 'approved' AND lr.request_type = 'sakit'
               AND a.attendance_date BETWEEN lr.start_date AND lr.end_date
           ) THEN a.attendance_date END) AS sakit_days
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN employees e ON e.id = a.employee_id
       ${where}`,
      params
    );

    const summary = {
      overtime_hours: Number(summaryRow?.overtime_hours) || 0,
      cuti_days: Number(summaryRow?.cuti_days) || 0,
      izin_days: Number(summaryRow?.izin_days) || 0,
      sakit_days: Number(summaryRow?.sakit_days) || 0,
    };

    res.json({
      success: true,
      data: rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) },
      summary,
    });
  } catch (err) {
    console.error('Get attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// LS Supervisor: LS users under this supervisor (master list for approvals UI)
const getTeamLsMembers = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.employee_id, e.nik AS nik
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.supervisor_id = ? AND u.role = 'ls'
       ORDER BY u.name ASC`,
      [supervisorId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get team LS members error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// LS Supervisor: list attendance of assigned LS employees
const getTeamAttendance = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { search, status, start_date, end_date, page = 1, limit = 20, user_id } = req.query;

    let where = 'WHERE u.supervisor_id = ?';
    const params = [supervisorId];

    if (user_id !== undefined && user_id !== null && user_id !== '') {
      const uid = parseInt(user_id, 10);
      if (!Number.isNaN(uid)) {
        where += ' AND a.user_id = ?';
        params.push(uid);
      }
    }

    if (search) {
      where += ' AND (u.name LIKE ? OR u.employee_id LIKE ? OR COALESCE(e.nik, a.nik) LIKE ?)';
      const t = `%${search}%`;
      params.push(t, t, t);
    }
    if (status) { where += ' AND a.status = ?'; params.push(status); }
    if (start_date) { where += ' AND a.attendance_date >= ?'; params.push(start_date); }
    if (end_date)   { where += ' AND a.attendance_date <= ?'; params.push(end_date); }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows] = await db.query(
      `SELECT a.*, u.name AS employee_name, u.employee_id,
              sup.name AS supervisor_name
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN users sup ON u.supervisor_id = sup.id
       LEFT JOIN employees e ON e.id = a.employee_id
       ${where}
       ORDER BY a.attendance_date DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN employees e ON e.id = a.employee_id
       ${where}`,
      params
    );

    res.json({ success: true, data: rows, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('Get team attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// LS Supervisor: approve or reject
const updateApproval = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { id } = req.params;
    const { action, rejection_note } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'." });
    }

    // Verify this record belongs to an LS under this supervisor
    const [rows] = await db.query(
      `SELECT a.* FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = ? AND u.supervisor_id = ?`,
      [id, supervisorId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attendance record not found or not under your supervision.' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await db.query(
      `UPDATE attendance
       SET status=?, approved_by=?, approved_at=NOW(), rejection_note=?
       WHERE id=?`,
      [newStatus, supervisorId, rejection_note || null, id]
    );

    res.json({ success: true, message: `Attendance ${newStatus} successfully.` });
  } catch (err) {
    console.error('Approval error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// LS Supervisor: bulk approve or reject selected pending records
const updateApprovalBulk = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const supervisorId = req.user.id;
    const { attendance_ids, action, rejection_note } = req.body;

    if (!Array.isArray(attendance_ids) || attendance_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'attendance_ids is required and must be a non-empty array.' });
    }
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'." });
    }

    const ids = [...new Set(attendance_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid attendance ids were provided.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const [ownedRows] = await conn.query(
      `SELECT a.id
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.id IN (${placeholders}) AND u.supervisor_id = ?`,
      [...ids, supervisorId]
    );
    const ownedIds = new Set(ownedRows.map((r) => Number(r.id)));
    if (ownedIds.size !== ids.length) {
      return res.status(403).json({
        success: false,
        message: 'Some selected records are not under your supervision.',
      });
    }

    const [pendingRows] = await conn.query(
      `SELECT id FROM attendance WHERE id IN (${placeholders}) AND status = 'pending'`,
      ids
    );
    const pendingIds = pendingRows.map((r) => Number(r.id));
    if (pendingIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending records were selected. Only pending records can be processed.',
      });
    }

    const pendingPlaceholders = pendingIds.map(() => '?').join(',');
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const noteValue = action === 'reject' ? (rejection_note || null) : null;

    await conn.beginTransaction();
    await conn.query(
      `UPDATE attendance
       SET status = ?, approved_by = ?, approved_at = NOW(), rejection_note = ?
       WHERE id IN (${pendingPlaceholders})`,
      [newStatus, supervisorId, noteValue, ...pendingIds]
    );
    await conn.commit();

    res.json({
      success: true,
      message: `${pendingIds.length} attendance record(s) ${newStatus} successfully.`,
      data: {
        processed_ids: pendingIds,
        skipped_count: ids.length - pendingIds.length,
      },
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* no-op */ }
    console.error('Bulk approval error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
  }
};

// LS Supervisor: monthly attendance recap by supervised LS
const getMonthlyAttendanceRecap = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const now = new Date();
    const qYear = parseInt(req.query.year, 10);
    const qMonth = parseInt(req.query.month, 10);
    const year = Number.isInteger(qYear) ? qYear : now.getFullYear();
    const month = Number.isInteger(qMonth) ? qMonth : (now.getMonth() + 1);

    if (month < 1 || month > 12) {
      return res.status(400).json({ success: false, message: 'month must be between 1 and 12.' });
    }
    if (year < 2000 || year > 2100) {
      return res.status(400).json({ success: false, message: 'year is out of allowed range.' });
    }

    const [rows] = await db.query(
      `SELECT
         u.id AS user_id,
         u.employee_id,
         u.name AS employee_name,
         e.nik,
         COUNT(a.id) AS total_attendance_records,
         SUM(CASE WHEN a.status = 'approved' THEN 1 ELSE 0 END) AS approved_attendance,
         SUM(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END) AS pending_attendance,
         SUM(CASE WHEN a.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_attendance,
         SUM(CASE WHEN a.clock_in_time IS NOT NULL THEN 1 ELSE 0 END) AS total_clock_in_days,
         SUM(CASE WHEN lr.request_type = 'cuti' THEN 1 ELSE 0 END) AS leave_cuti,
         SUM(CASE WHEN lr.request_type = 'izin' THEN 1 ELSE 0 END) AS leave_izin,
         SUM(CASE WHEN lr.request_type = 'sakit' THEN 1 ELSE 0 END) AS leave_sakit
       FROM users u
       LEFT JOIN employees e
         ON e.user_id = u.id
       LEFT JOIN attendance a
         ON a.user_id = u.id
        AND YEAR(a.attendance_date) = ?
        AND MONTH(a.attendance_date) = ?
       LEFT JOIN leave_requests lr
         ON lr.user_id = u.id
        AND lr.status = 'approved'
        AND (
          (YEAR(lr.start_date) = ? AND MONTH(lr.start_date) = ?)
          OR
          (YEAR(lr.end_date) = ? AND MONTH(lr.end_date) = ?)
        )
   
       WHERE u.supervisor_id = ? AND u.role = 'ls'
       GROUP BY u.id, u.employee_id, u.name, e.nik
       ORDER BY u.name ASC`,
      [year, month, year, month, year, month, supervisorId]
    );

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        nik: r.nik || null,
      })),
      meta: { month, year },
    });
  } catch (err) {
    console.error('Monthly attendance recap error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Get single attendance record detail
const getAttendanceDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user.role;
    const userId = req.user.id;

    const [rows] = await db.query(
      `SELECT a.*, u.name AS employee_name, u.employee_id, u.role,
              sup.name AS supervisor_name,
              app.name AS approver_name,
              u.vendor_id AS employee_vendor_id,
              e.nik AS emp_nik
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN users sup ON u.supervisor_id = sup.id
       LEFT JOIN users app ON a.approved_by = app.id
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Not found.' });
    }

    const row = rows[0];
    if (row.emp_nik) {
      row.nik = row.emp_nik;
    }
    delete row.emp_nik;
    if (role === 'ls' && row.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    if (role === 'ls_supervisor') {
      const [sup] = await db.query(
        'SELECT supervisor_id FROM users WHERE id = ?',
        [row.user_id]
      );
      if (!sup.length || sup[0].supervisor_id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
      }
    }
    if (role === 'vendor') {
      const [me] = await db.query('SELECT vendor_id FROM users WHERE id = ?', [userId]);
      const vid = me[0]?.vendor_id;
      if (row.employee_vendor_id == null || row.employee_vendor_id !== vid) {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
      }
    }

    delete row.employee_vendor_id;
    res.json({ success: true, data: row });
  } catch (err) {
    console.error('Detail error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  createAttendance,
  saveMyOvertime,
  getMyAttendance,
  getTeamLsMembers,
  getTeamAttendance,
  updateApproval,
  updateApprovalBulk,
  getMonthlyAttendanceRecap,
  getAttendanceDetail,
};
