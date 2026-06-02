const db = require('../config/database');

/** First calendar day of month (MySQL DATE) */
function monthBoundsParams(year, month) {
  const y = parseInt(year, 10);
  const m = Math.min(12, Math.max(1, parseInt(month, 10) || 1));
  return { y, m, padM: String(m).padStart(2, '0') };
}

/**
 * Leave rows overlapping the report month for LS under vendor.
 *
 * Audit-trail visibility: every leave row (Pending, Approved, Rejected,
 * Cancelled, Withdrawn) is returned so the PDF "Absences" section and
 * status counters reflect the full picture. The `pdfService` is the one
 * responsible for deciding which statuses contribute to BILLABLE day
 * counts — see `applyMonthlyLeaveCountsFromRequests` which still counts
 * only `approved` for cuti / izin / sakit day totals.
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
 * AUDIT-TRAIL RULES (consumed by the Monthly Sheet / BAST PDF):
 *   • Every attendance row — Approved, Pending, Rejected, Cancelled and
 *     Withdrawn — is returned. Pending and Rejected lines stay visible so
 *     PIC LS and SSU can review the full chain of submissions before sign-off.
 *   • Internal `superseded` machine rows (the originals that were retired
 *     when a correction was approved) are intentionally hidden — they are an
 *     implementation detail of the correction workflow, not a real submission.
 *   • Per (user_id, attendance_date) we still collapse down to ONE
 *     representative line so the audit table does not double-print a day:
 *       – if an Approved row exists, the LATEST approved is shown (preserves
 *         the previous payroll/BAST integrity rule);
 *       – otherwise the most recent Pending / Rejected / Cancelled /
 *         Withdrawn row is shown so the day is never silently dropped.
 *   • The leave-count subquery (cuti / izin / sakit days) intentionally
 *     stays `status = 'approved'` — billable counters must not inflate
 *     when the LS pulls a request back.
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
       AND a.status <> 'superseded'
       AND a.id = (
         SELECT a2.id
         FROM attendance a2
         WHERE a2.user_id = a.user_id
           AND a2.attendance_date = a.attendance_date
           AND a2.status <> 'superseded'
         ORDER BY
           (a2.status = 'approved') DESC,
           COALESCE(a2.approved_at, a2.updated_at, a2.created_at) DESC,
           a2.id DESC
         LIMIT 1
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
