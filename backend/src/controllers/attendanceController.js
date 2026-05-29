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

const pickLatestByUpdatedOrCreated = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.sort((a, b) => {
    const aTs = Date.parse(a.updated_at || a.created_at || 0);
    const bTs = Date.parse(b.updated_at || b.created_at || 0);
    return bTs - aTs;
  })[0];
};

// NOTE: legacy LS overtime endpoint was removed; the dedicated Overtime menu
// (overtimeController + /api/overtimes) is now the single submission path.
// `attendance.ot_start_time/ot_end_time/ot_summary` are populated by the
// Supervisor approval flow in overtimeController so existing analytics
// (Monthly Sheet, BAST, OT hour summaries) keep working untouched.

// LS: create attendance request row with in/out pairing sequence
const createAttendance = async (req, res) => {
  const conn = await db.getConnection();
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
          'Profil karyawan dengan NIK belum ditemukan. Akun harus ditautkan ke data karyawan. Hubungi HR.',
      });
    }
    const nikNorm = normalizeNik(emp.nik);
    if (!nikNorm) {
      return res.status(400).json({
        success: false,
        message: 'NIK pada master karyawan tidak valid. Hubungi HR.',
      });
    }
    const employeeId = emp.employee_id;

    const [dateRows] = await conn.query(
      `SELECT *
       FROM attendance
       WHERE user_id = ? AND attendance_date = ?
       ORDER BY is_effective DESC, id DESC`,
      [userId, attendanceYmd]
    );
    const effectiveRow = dateRows.find((r) => Number(r.is_effective) === 1) || null;
    const pendingCorrection = pickLatestByUpdatedOrCreated(
      dateRows.filter((r) => r.source_type === 'correction' && r.status === 'pending')
    );

    let affectedAttendanceId = null;
    if (type === 'clock_in') {
      if (pendingCorrection && pendingCorrection.clock_in_time) {
        return res
          .status(409)
          .json({ success: false, message: 'Pending correction clock-in already recorded for this date.' });
      }

      await conn.beginTransaction();

      if (!pendingCorrection) {
        await conn.query(
          `INSERT INTO attendance (
             user_id, employee_id, nik, attendance_date,
             clock_in_time, clock_in_lat, clock_in_lng, clock_in_address,
             status, source_type, is_effective
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'correction', 0)`,
          [
            userId,
            employeeId,
            nikNorm,
            attendanceYmd,
            time,
            latitude || null,
            longitude || null,
            address || null,
          ]
        );
      } else {
        await conn.query(
          `UPDATE attendance
           SET employee_id = ?, nik = ?,
               clock_in_time = ?, clock_in_lat = ?, clock_in_lng = ?, clock_in_address = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND source_type = 'correction' AND status = 'pending'`,
          [
            employeeId,
            nikNorm,
            time,
            latitude || null,
            longitude || null,
            address || null,
            pendingCorrection.id,
          ]
        );
      }
      await conn.commit();
    } else if (type === 'clock_out') {
      if (!pendingCorrection || !pendingCorrection.clock_in_time) {
        if (effectiveRow && effectiveRow.clock_in_time) {
          return res.status(400).json({
            success: false,
            message: 'Create a correction clock-in first before submitting correction clock-out.',
          });
        }
        return res.status(400).json({ success: false, message: 'No pending correction clock-in found for this date.' });
      }
      if (pendingCorrection.clock_out_time) {
        return res.status(409).json({ success: false, message: 'Pending correction clock-out already recorded for this date.' });
      }

      await conn.query(
        `UPDATE attendance
         SET clock_out_time = ?, clock_out_lat = ?, clock_out_lng = ?, clock_out_address = ?, nik = ?, employee_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND source_type = 'correction' AND status = 'pending'`,
        [time, latitude || null, longitude || null, address || null, nikNorm, employeeId, pendingCorrection.id]
      );
    } else {
      return res.status(400).json({ success: false, message: "type must be 'clock_in' or 'clock_out'." });
    }

    const [updated] = await conn.query(
      `SELECT *
       FROM attendance
       WHERE user_id = ? AND attendance_date = ?
       ORDER BY is_effective DESC, id DESC`,
      [userId, attendanceYmd]
    );

    const latestCorrection = pickLatestByUpdatedOrCreated(
      updated.filter((r) => r.source_type === 'correction' && r.status === 'pending')
    );
    res.json({
      success: true,
      message: 'Correction submitted and awaiting supervisor approval.',
      data: latestCorrection || updated[0],
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* no-op */
    }
    console.error('Create attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
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

    // `lr.status = 'approved'` already filters out cancelled / withdrawn
    // requests — those rows must never colour an attendance day as cuti /
    // izin / sakit in the LS summary or vendor recap.
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
       ORDER BY a.attendance_date DESC, a.created_at DESC, a.id DESC
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

    // Overtime hours are summed only from the LATEST APPROVED attendance
    // row per (user_id, attendance_date). This protects payroll / invoice
    // accuracy when an LS has multiple approved correction attempts on the
    // same day and prevents cancelled / withdrawn rows from inflating
    // totals.
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
       ${where}
         AND a.status = 'approved'
         AND a.id = (
           SELECT MAX(a2.id) FROM attendance a2
           WHERE a2.user_id = a.user_id
             AND a2.attendance_date = a.attendance_date
             AND a2.status = 'approved'
         )`,
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
    if (status) {
      where += ' AND a.status = ?';
      params.push(status);
    } else {
      // Managerial Review must not surface requests the LS already pulled
      // back; cancelled / withdrawn rows are hidden from the default
      // Supervisor queue but stay queryable via explicit `status`.
      where += " AND a.status NOT IN ('cancelled', 'withdrawn')";
    }
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
       ORDER BY a.attendance_date DESC, a.created_at DESC, a.id DESC
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
  const conn = await db.getConnection();
  try {
    const supervisorId = req.user.id;
    const { id } = req.params;
    const { action, rejection_note } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'." });
    }

    // Verify this record belongs to an LS under this supervisor
    const [rows] = await conn.query(
      `SELECT a.* FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = ? AND u.supervisor_id = ?`,
      [id, supervisorId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attendance record not found or not under your supervision.' });
    }

    const row = rows[0];
    if (row.source_type !== 'correction') {
      return res.status(400).json({
        success: false,
        message: 'Only correction records can be approved/rejected from this endpoint.',
      });
    }
    if (row.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending correction records can be processed.',
      });
    }

    await conn.beginTransaction();
    if (action === 'approve') {
      const [originalRows] = await conn.query(
        `SELECT id
         FROM attendance
         WHERE user_id = ? AND attendance_date = ? AND source_type = 'machine' AND is_effective = 1
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [row.user_id, row.attendance_date]
      );
      if (originalRows.length === 0) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: 'Original machine attendance not found for this user and date.',
        });
      }

      await conn.query(
        `UPDATE attendance
         SET status = 'superseded', is_effective = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [originalRows[0].id]
      );

      await conn.query(
        `UPDATE attendance
         SET status = 'approved', is_effective = 1, approved_by = ?, approved_at = NOW(), rejection_note = NULL
         WHERE id = ?`,
        [supervisorId, id]
      );
      await conn.commit();
      return res.json({ success: true, message: 'Correction approved and original machine record superseded.' });
    }

    await conn.query(
      `UPDATE attendance
       SET status = 'rejected', approved_by = ?, approved_at = NOW(), rejection_note = ?, is_effective = 0
       WHERE id = ?`,
      [supervisorId, rejection_note || null, id]
    );
    await conn.commit();

    res.json({ success: true, message: 'Correction rejected. Original machine record remains effective.' });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* no-op */
    }
    console.error('Approval error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
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
      `SELECT id, user_id, attendance_date
       FROM attendance
       WHERE id IN (${placeholders}) AND status = 'pending' AND source_type = 'correction'`,
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
    await conn.beginTransaction();
    if (action === 'approve') {
      for (const corr of pendingRows) {
        const [originalRows] = await conn.query(
          `SELECT id
           FROM attendance
           WHERE user_id = ? AND attendance_date = ? AND source_type = 'machine' AND is_effective = 1
           ORDER BY id DESC
           LIMIT 1
           FOR UPDATE`,
          [corr.user_id, corr.attendance_date]
        );
        if (originalRows.length === 0) {
          throw new Error(`Original machine attendance not found for correction id ${corr.id}.`);
        }
        await conn.query(
          `UPDATE attendance
           SET status = 'superseded', is_effective = 0, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [originalRows[0].id]
        );
        await conn.query(
          `UPDATE attendance
           SET status = 'approved', is_effective = 1, approved_by = ?, approved_at = NOW(), rejection_note = NULL
           WHERE id = ?`,
          [supervisorId, corr.id]
        );
      }
    } else {
      await conn.query(
        `UPDATE attendance
         SET status = 'rejected', approved_by = ?, approved_at = NOW(), rejection_note = ?, is_effective = 0
         WHERE id IN (${pendingPlaceholders})`,
        [supervisorId, rejection_note || null, ...pendingIds]
      );
    }
    await conn.commit();

    res.json({
      success: true,
      message:
        action === 'approve'
          ? `${pendingIds.length} correction record(s) approved and machine rows superseded successfully.`
          : `${pendingIds.length} correction record(s) rejected successfully.`,
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

    // Counting rules (data-integrity guarantee for Monthly Recap / BAST):
    //
    //  • `approved_attendance` and `total_clock_in_days` ignore cancelled /
    //    withdrawn / superseded rows, and de-duplicate to the LATEST
    //    APPROVED record per (user_id, attendance_date) so a day cannot be
    //    counted twice when an LS submitted multiple correction attempts.
    //  • `pending_attendance` mirrors the Supervisor inbox so cancelled /
    //    withdrawn rows do NOT inflate the alert badge.
    //  • `rejected_attendance` keeps reporting visibility on rejections only.
    //  • `total_attendance_records` is now the sum of the actionable buckets
    //    so the cancelled / withdrawn rows are excluded from the headline.
    //  • `leave_*` counts approved leave requests overlapping the month and
    //    intentionally skips cancelled / withdrawn rows.
    const [rows] = await db.query(
      `SELECT
         u.id AS user_id,
         u.employee_id,
         u.name AS employee_name,
         e.nik,
         (COALESCE(att.approved_attendance, 0)
            + COALESCE(att.pending_attendance, 0)
            + COALESCE(att.rejected_attendance, 0)) AS total_attendance_records,
         COALESCE(att.approved_attendance, 0) AS approved_attendance,
         COALESCE(att.pending_attendance, 0) AS pending_attendance,
         COALESCE(att.rejected_attendance, 0) AS rejected_attendance,
         COALESCE(att.total_clock_in_days, 0) AS total_clock_in_days,
         COALESCE(lv.leave_cuti, 0) AS leave_cuti,
         COALESCE(lv.leave_izin, 0) AS leave_izin,
         COALESCE(lv.leave_sakit, 0) AS leave_sakit
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN (
         SELECT
           latest.user_id,
           SUM(CASE WHEN latest.status = 'approved' THEN 1 ELSE 0 END) AS approved_attendance,
           SUM(CASE WHEN latest.status = 'approved' AND latest.clock_in_time IS NOT NULL THEN 1 ELSE 0 END) AS total_clock_in_days,
           COALESCE(pend.pending_attendance, 0) AS pending_attendance,
           COALESCE(rej.rejected_attendance, 0) AS rejected_attendance
         FROM (
           SELECT a.user_id, a.attendance_date, a.status, a.clock_in_time
           FROM attendance a
           WHERE YEAR(a.attendance_date) = ? AND MONTH(a.attendance_date) = ?
             AND a.status = 'approved'
             AND a.id = (
               SELECT MAX(a2.id) FROM attendance a2
               WHERE a2.user_id = a.user_id
                 AND a2.attendance_date = a.attendance_date
                 AND a2.status = 'approved'
             )
         ) latest
         LEFT JOIN (
           SELECT user_id, COUNT(*) AS pending_attendance
           FROM attendance
           WHERE YEAR(attendance_date) = ? AND MONTH(attendance_date) = ?
             AND status = 'pending'
           GROUP BY user_id
         ) pend ON pend.user_id = latest.user_id
         LEFT JOIN (
           SELECT user_id, COUNT(*) AS rejected_attendance
           FROM attendance
           WHERE YEAR(attendance_date) = ? AND MONTH(attendance_date) = ?
             AND status = 'rejected'
           GROUP BY user_id
         ) rej ON rej.user_id = latest.user_id
         GROUP BY latest.user_id, pend.pending_attendance, rej.rejected_attendance
       ) att ON att.user_id = u.id
       LEFT JOIN (
         SELECT
           user_id,
           SUM(CASE WHEN request_type = 'cuti' THEN 1 ELSE 0 END) AS leave_cuti,
           SUM(CASE WHEN request_type = 'izin' THEN 1 ELSE 0 END) AS leave_izin,
           SUM(CASE WHEN request_type = 'sakit' THEN 1 ELSE 0 END) AS leave_sakit
         FROM leave_requests
         WHERE status = 'approved'
           AND (
             (YEAR(start_date) = ? AND MONTH(start_date) = ?)
           )
         GROUP BY user_id
       ) lv ON lv.user_id = u.id
       WHERE u.supervisor_id = ? AND u.role = 'ls'
       ORDER BY u.name ASC`,
      [year, month, year, month, year, month, year, month, supervisorId]
    );

    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayNum = new Date(year, month, 0).getDate();
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

    // Cancelled / withdrawn leave rows are LS-driven retractions and must
    // not appear in the Supervisor's Monthly Recap drill-down either —
    // keeping them would visually contradict the headline counts above.
    const [leaveDetailRows] = await db.query(
      `SELECT
         lr.id,
         lr.user_id,
         lr.request_type,
         lr.start_date,
         lr.end_date,
         lr.reason,
         lr.status,
         lr.rejection_note,
         lr.approved_at,
         lr.created_at
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE u.supervisor_id = ? AND u.role = 'ls'
         AND lr.status NOT IN ('cancelled', 'withdrawn')
         AND lr.start_date <= ?
         AND lr.end_date >= ?
       ORDER BY lr.user_id ASC, lr.start_date ASC, lr.id ASC`,
      [supervisorId, lastDay, firstDay]
    );

    const leavesByUserId = {};
    for (const lr of leaveDetailRows) {
      const uid = lr.user_id;
      if (!leavesByUserId[uid]) leavesByUserId[uid] = [];
      leavesByUserId[uid].push({
        id: lr.id,
        request_type: lr.request_type,
        start_date: lr.start_date,
        end_date: lr.end_date,
        reason: lr.reason,
        status: lr.status,
        rejection_note: lr.rejection_note,
        approved_at: lr.approved_at,
        created_at: lr.created_at,
      });
    }

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        nik: r.nik || null,
        leave_requests: leavesByUserId[r.user_id] || [],
      })),
      meta: { month, year },
    });
  } catch (err) {
    console.error('Monthly attendance recap error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// LS: cancel an own pending attendance correction OR withdraw an own approved correction.
//
// Cancel  (status pending  → cancelled)  : nothing else to do; the row simply
//                                          drops out of the Supervisor review queue.
// Withdraw(status approved → withdrawn)  : the row stops being is_effective; if the
//                                          approval had superseded a machine record
//                                          we revive that machine row so the day still
//                                          has the original biometric snapshot. The
//                                          underlying approval workflow is untouched.
const cancelOrWithdrawAttendance = async (req, res) => {
  const action = req.body?.action === 'withdraw' ? 'withdraw' : 'cancel';
  const conn = await db.getConnection();
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [rows] = await conn.query(
      'SELECT * FROM attendance WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found or does not belong to you.',
      });
    }
    const row = rows[0];

    if (action === 'cancel') {
      if (row.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only pending requests can be cancelled.',
        });
      }
      await conn.query(
        `UPDATE attendance
         SET status = 'cancelled', is_effective = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [id]
      );
      return res.json({
        success: true,
        message: 'Attendance request cancelled.',
        data: { id: Number(id), status: 'cancelled' },
      });
    }

    if (row.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved requests can be withdrawn.',
      });
    }

    await conn.beginTransaction();
    await conn.query(
      `UPDATE attendance
       SET status = 'withdrawn', is_effective = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );
    if (row.source_type === 'correction') {
      const [supersededRows] = await conn.query(
        `SELECT id FROM attendance
         WHERE user_id = ? AND attendance_date = ?
           AND source_type = 'machine' AND status = 'superseded'
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [row.user_id, row.attendance_date]
      );
      if (supersededRows.length > 0) {
        await conn.query(
          `UPDATE attendance
           SET status = 'approved', is_effective = 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [supersededRows[0].id]
        );
      }
    }
    await conn.commit();

    res.json({
      success: true,
      message:
        'Attendance request withdrawn. The original biometric record (if any) is now effective again.',
      data: { id: Number(id), status: 'withdrawn' },
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* no-op */ }
    console.error('Cancel/withdraw attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
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
  getMyAttendance,
  getTeamLsMembers,
  getTeamAttendance,
  updateApproval,
  updateApprovalBulk,
  getMonthlyAttendanceRecap,
  getAttendanceDetail,
  cancelOrWithdrawAttendance,
};
