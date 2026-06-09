/** YYYY-MM-DD for SQL binding (hindari drift timezone dari objek Date mysql2). */
function toSqlDate(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/** TIME ke string HH:MM:SS untuk kolom MySQL TIME. */
function toSqlTime(value) {
  if (value == null) return null;
  const s = String(value).trim();
  const timeMatch = /(?:\s|T)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s) || /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!timeMatch) return null;
  const h = String(parseInt(timeMatch[1], 10)).padStart(2, '0');
  const min = String(parseInt(timeMatch[2], 10)).padStart(2, '0');
  const sec = timeMatch[3] != null ? String(parseInt(timeMatch[3], 10)).padStart(2, '0') : '00';
  return `${h}:${min}:${sec}`;
}

function timesEqualSql(a, b) {
  return toSqlTime(a) === toSqlTime(b);
}

/** Durasi kerja dalam menit (time_out - time_in, same-day; jika negatif +24 jam). */
function shiftDurationMinutes(timeIn, timeOut) {
  const a = toSqlTime(timeIn);
  const b = toSqlTime(timeOut);
  if (!a || !b) return 0;
  const [h1, m1] = a.split(':').map((x) => parseInt(x, 10));
  const [h2, m2] = b.split(':').map((x) => parseInt(x, 10));
  let mins = h2 * 60 + m2 - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

/**
 * Cocokkan identitas dari file glog (kolom "NIK") ke master hr_employees.
 * Setelah konsolidasi nik → npk, nilai file dicocokkan ke npk / employee_id /
 * sid agar baris lama yang masih memakai SID atau employee_id tetap valid.
 */
async function resolveEmployeeForGlogNik(conn, rawNik) {
  const trimmed = String(rawNik || '').trim();
  if (!trimmed) return { employee: null, reason: 'empty_nik' };
  const [rows] = await conn.query(
    `SELECT e.id AS employee_id, e.user_id, e.npk
     FROM hr_employees e
     INNER JOIN users u ON u.id = e.user_id AND u.role = 'ls' AND u.is_active = 1
     WHERE e.user_status = 'Active'
       AND e.user_id IS NOT NULL
       AND (e.npk = ? OR u.employee_id = ? OR e.sid = ? OR u.sid = ?)
     LIMIT 1`,
    [trimmed, trimmed, trimmed, trimmed]
  );
  if (rows.length === 0) return { employee: null, reason: 'unmatched_nik' };
  return { employee: rows[0], reason: null };
}

/**
 * Satu baris agregat harian (nik + tanggal + time_in/out) → attendance.
 * Jika `createEmployeeIfUnmatched` = false, NIK/NPK yang tidak match di
 * hr_employees akan dilewati (skip), tanpa membuat placeholder user/employee.
 */
async function upsertAttendanceFromGlogDailyRow(conn, row, { createEmployeeIfUnmatched }) {
  const out = {
    result: 'skip',
    skipReason: null,
    employeeCreated: false,
  };

  const empMatch = await resolveEmployeeForGlogNik(conn, row.nik);
  const { employee, reason } = empMatch;

  const attendanceDate = toSqlDate(row.attendance_date);
  const clockIn = toSqlTime(row.time_in);
  const clockOut = toSqlTime(row.time_out);
  if (!attendanceDate || !clockIn || !clockOut) {
    out.skipReason = 'invalid_time';
    return out;
  }

  if (!employee) {
    out.skipReason = reason === 'empty_nik' ? 'invalid_time' : 'unmatched_nik';
    return out;
  }

  const canonicalNpk = String(employee.npk || '').trim().slice(0, 64);
  if (!canonicalNpk) {
    out.skipReason = 'unmatched_nik';
    return out;
  }

  const [existing] = await conn.query(
    `SELECT id, status, clock_in_time, clock_out_time
     FROM attendance
     WHERE user_id = ? AND attendance_date = ?
       AND status IN ('approved', 'pending')
     ORDER BY id DESC
     LIMIT 1`,
    [employee.user_id, attendanceDate]
  );

  if (existing.length === 0) {
    await conn.query(
      `INSERT INTO attendance (
         user_id, employee_id, nik, attendance_date,
         clock_in_time, clock_out_time,
         clock_in_lat, clock_in_lng, clock_in_address,
         clock_out_lat, clock_out_lng, clock_out_address,
         ot_start_time, ot_end_time, ot_summary,
         status
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'approved')`,
      [employee.user_id, employee.employee_id, canonicalNpk, attendanceDate, clockIn, clockOut]
    );
    out.result = 'insert';
    return out;
  }

  if (existing[0].status === 'pending') {
    out.skipReason = 'non_pending';
    return out;
  }

  if (timesEqualSql(existing[0].clock_in_time, clockIn) && timesEqualSql(existing[0].clock_out_time, clockOut)) {
    out.skipReason = 'duplicate_noop';
    return out;
  }

  await conn.query(
    `UPDATE attendance SET
       employee_id = ?,
       nik = ?,
       clock_in_time = ?,
       clock_out_time = ?,
       status = 'approved',
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [employee.employee_id, canonicalNpk, clockIn, clockOut, existing[0].id]
  );
  out.result = 'update';
  return out;
}

function tallyUpsertStats(stats, r) {
  if (r.result === 'insert') stats.attendance_inserted += 1;
  else if (r.result === 'update') stats.attendance_updated_pending += 1;
  else if (r.skipReason === 'non_pending') stats.attendance_skipped_non_pending += 1;
  else if (r.skipReason === 'invalid_time') stats.attendance_skipped_invalid_time += 1;
  else if (r.skipReason === 'unmatched_nik') stats.attendance_skipped_unmatched_nik += 1;
  else if (r.skipReason === 'duplicate_noop') stats.attendance_skipped_duplicate_noop += 1;
  if (r.employeeCreated) stats.employee_placeholder_created = (stats.employee_placeholder_created || 0) + 1;
}

function emptyAttendanceSyncStats() {
  return {
    attendance_inserted: 0,
    attendance_updated_pending: 0,
    attendance_skipped_non_pending: 0,
    attendance_skipped_unmatched_nik: 0,
    attendance_skipped_invalid_time: 0,
    attendance_skipped_duplicate_noop: 0,
    employee_placeholder_created: 0,
  };
}

module.exports = {
  toSqlDate,
  toSqlTime,
  timesEqualSql,
  shiftDurationMinutes,
  resolveEmployeeForGlogNik,
  upsertAttendanceFromGlogDailyRow,
  tallyUpsertStats,
  emptyAttendanceSyncStats,
};
