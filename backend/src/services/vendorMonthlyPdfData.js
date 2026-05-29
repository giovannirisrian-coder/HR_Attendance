const db = require('../config/database');

/** First calendar day of month (MySQL DATE) */
function monthBoundsParams(year, month) {
  const y = parseInt(year, 10);
  const m = Math.min(12, Math.max(1, parseInt(month, 10) || 1));
  return { y, m, padM: String(m).padStart(2, '0') };
}

/**
 * Leave rows overlapping the report month for LS under vendor.
 * Cancelled / withdrawn rows are intentionally excluded — those are
 * requests the LS has pulled back and must not appear in vendor recap.
 * @returns {Promise<Array<{ id: number, user_id: number, employee_name: string, employee_id: string, request_type: string, start_date: Date|string, end_date: Date|string, status: string }>>}
 */
async function fetchVendorLeaveRowsOverlappingMonth(vendorId, month, year) {
  const { y, padM } = monthBoundsParams(year, month);
  const [leaveRows] = await db.query(
    `SELECT lr.id,
            lr.user_id,
            u.name AS employee_name,
            u.employee_id,
            lr.request_type,
            lr.start_date,
            lr.end_date,
            lr.status
     FROM leave_requests lr
     JOIN users u ON lr.user_id = u.id
     WHERE u.vendor_id = ?
       AND u.role = 'ls'
       AND lr.status NOT IN ('cancelled', 'withdrawn')
       AND lr.start_date <= LAST_DAY(STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d'))
       AND lr.end_date >= STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d')
     ORDER BY u.name, lr.start_date, lr.id`,
    [vendorId, y, padM, y, padM]
  );
  return leaveRows;
}

/**
 * Attendance lines for vendor LS in month, with monthly leave aggregates and overtime times.
 *
 * Data-integrity guarantee for BAST / Salary Recap / Monthly Sheet:
 *   • Only the LATEST APPROVED attendance row per (user_id, attendance_date)
 *     is returned, so multiple correction attempts collapse into a single
 *     billable line.
 *   • Cancelled / withdrawn attendance rows are skipped via `status='approved'`.
 *   • Cancelled / withdrawn leave requests are skipped via the same NOT IN
 *     filter that powers Monthly Recap.
 */
async function fetchVendorAttendanceRowsForMonthlyPdf(vendorId, month, year) {
  const { y, padM } = monthBoundsParams(year, month);
  const [rows] = await db.query(
    `SELECT a.attendance_date, a.clock_in_time, a.clock_out_time, a.status,
            a.ot_start_time, a.ot_end_time,
            u.name AS employee_name, u.employee_id,
            COALESCE(lr.leave_cuti, 0) AS leave_cuti,
            COALESCE(lr.leave_sakit, 0) AS leave_sakit,
            COALESCE(lr.leave_izin, 0) AS leave_izin
     FROM attendance a
     JOIN users u ON a.user_id = u.id
     LEFT JOIN (
       SELECT
         user_id,
         SUM(CASE WHEN request_type = 'cuti' THEN 1 ELSE 0 END) AS leave_cuti,
         SUM(CASE WHEN request_type = 'sakit' THEN 1 ELSE 0 END) AS leave_sakit,
         SUM(CASE WHEN request_type = 'izin' THEN 1 ELSE 0 END) AS leave_izin
       FROM leave_requests
       WHERE status = 'approved'
         AND start_date <= LAST_DAY(STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d'))
         AND end_date >= STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d')
       GROUP BY user_id
     ) lr ON lr.user_id = u.id
     WHERE u.vendor_id = ? AND u.role = 'ls'
       AND MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?
       AND a.status = 'approved'
       AND a.id = (
         SELECT MAX(a2.id) FROM attendance a2
         WHERE a2.user_id = a.user_id
           AND a2.attendance_date = a.attendance_date
           AND a2.status = 'approved'
       )
     ORDER BY u.name, a.attendance_date`,
    [y, padM, y, padM, vendorId, month, y]
  );
  return rows;
}

async function fetchVendorMonthlyPdfData(vendorId, month, year) {
  const [rows, leaveRows] = await Promise.all([
    fetchVendorAttendanceRowsForMonthlyPdf(vendorId, month, year),
    fetchVendorLeaveRowsOverlappingMonth(vendorId, month, year),
  ]);
  return { rows, leaveRows };
}

module.exports = {
  fetchVendorMonthlyPdfData,
  fetchVendorAttendanceRowsForMonthlyPdf,
  fetchVendorLeaveRowsOverlappingMonth,
};
