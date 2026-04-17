const db = require('../config/database');

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

    // Check existing record for this date
    const [existing] = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND attendance_date = ?',
      [userId, attendance_date]
    );

    if (type === 'clock_in') {
      if (existing.length > 0 && existing[0].clock_in_time) {
        return res.status(409).json({ success: false, message: 'Clock-in already recorded for this date.' });
      }

      if (existing.length === 0) {
        await db.query(
          `INSERT INTO attendance
            (user_id, attendance_date, clock_in_time, clock_in_lat, clock_in_lng, clock_in_address, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
          [userId, attendance_date, time, latitude || null, longitude || null, address || null]
        );
      } else {
        await db.query(
          `UPDATE attendance SET clock_in_time=?, clock_in_lat=?, clock_in_lng=?, clock_in_address=?
           WHERE user_id=? AND attendance_date=?`,
          [time, latitude || null, longitude || null, address || null, userId, attendance_date]
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
        `UPDATE attendance SET clock_out_time=?, clock_out_lat=?, clock_out_lng=?, clock_out_address=?
         WHERE user_id=? AND attendance_date=?`,
        [time, latitude || null, longitude || null, address || null, userId, attendance_date]
      );
    } else {
      return res.status(400).json({ success: false, message: "type must be 'clock_in' or 'clock_out'." });
    }

    const [updated] = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND attendance_date = ?',
      [userId, attendance_date]
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
    const { start_date, end_date, page = 1, limit = 20 } = req.query;

    let where = 'WHERE a.user_id = ?';
    const params = [userId];

    if (start_date) { where += ' AND a.attendance_date >= ?'; params.push(start_date); }
    if (end_date)   { where += ' AND a.attendance_date <= ?'; params.push(end_date); }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows] = await db.query(
      `SELECT a.*, u.name AS employee_name, u.employee_id
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       ${where}
       ORDER BY a.attendance_date DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM attendance a ${where}`,
      params
    );

    res.json({ success: true, data: rows, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('Get attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// LS Supervisor: list attendance of assigned LS employees
const getTeamAttendance = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { search, status, start_date, end_date, page = 1, limit = 20 } = req.query;

    let where = 'WHERE u.supervisor_id = ?';
    const params = [supervisorId];

    if (search) {
      where += ' AND (u.name LIKE ? OR u.employee_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
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
       ${where}
       ORDER BY a.attendance_date DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM attendance a JOIN users u ON a.user_id = u.id ${where}`,
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

// Get single attendance record detail
const getAttendanceDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `SELECT a.*, u.name AS employee_name, u.employee_id, u.role,
              sup.name AS supervisor_name,
              app.name AS approver_name
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN users sup ON u.supervisor_id = sup.id
       LEFT JOIN users app ON a.approved_by = app.id
       WHERE a.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Detail error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  createAttendance,
  getMyAttendance,
  getTeamAttendance,
  updateApproval,
  getAttendanceDetail,
};
