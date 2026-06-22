const db = require('../config/database');
const { calcVendorReportDateRange, normalizeCloseBookDate } = require('../utils/vendorCloseBookDate');

/** First calendar day of month (MySQL DATE) — legacy helper */
function monthBoundsParams(year, month) {
  const y = parseInt(year, 10);
  const m = Math.min(12, Math.max(1, parseInt(month, 10) || 1));
  return { y, m, padM: String(m).padStart(2, '0') };
}

function resolvePeriod(closeBookDate, month, year) {
  const cfg = normalizeCloseBookDate(closeBookDate);
  return calcVendorReportDateRange(cfg, month, year);
}

/**
 * Leave rows overlapping the report period for LS under vendor.
 *
 * Audit-trail visibility: every leave row (Pending, Approved, Rejected,
 * Cancelled, Withdrawn) is returned so the PDF "Absences" section and
 * status counters reflect the full picture. The `pdfService` is the one
 * responsible for deciding which statuses contribute to BILLABLE day
 * counts — see `applyMonthlyLeaveCountsFromRequests` which still counts
 * only `approved` for cuti / izin / sakit day totals.
 */
async function fetchVendorLeaveRowsOverlappingMonth(vendorId, month, year, closeBookDate = 1) {
  const { startDate, endDate } = resolvePeriod(closeBookDate, month, year);
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
       AND lr.start_date <= ?
       AND lr.end_date >= ?
     ORDER BY u.name, lr.start_date, lr.id`,
    [vendorId, endDate, startDate]
  );
  return leaveRows;
}

/**
 * Attendance lines for vendor LS in the close-book period, with leave aggregates and overtime times.
 */
async function fetchVendorAttendanceRowsForMonthlyPdf(vendorId, month, year, closeBookDate = 1) {
  const { startDate, endDate } = resolvePeriod(closeBookDate, month, year);
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
         AND start_date <= ?
         AND end_date >= ?
       GROUP BY user_id
     ) lr ON lr.user_id = u.id
     WHERE u.vendor_id = ? AND u.role = 'ls'
       AND a.attendance_date >= ? AND a.attendance_date <= ?
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
    [endDate, startDate, vendorId, startDate, endDate]
  );
  return rows;
}

async function fetchVendorMonthlyPdfData(vendorId, month, year, closeBookDate = 1) {
  const period = resolvePeriod(closeBookDate, month, year);
  const [rows, leaveRows] = await Promise.all([
    fetchVendorAttendanceRowsForMonthlyPdf(vendorId, month, year, closeBookDate),
    fetchVendorLeaveRowsOverlappingMonth(vendorId, month, year, closeBookDate),
  ]);
  return { rows, leaveRows, period };
}

module.exports = {
  fetchVendorMonthlyPdfData,
  fetchVendorAttendanceRowsForMonthlyPdf,
  fetchVendorLeaveRowsOverlappingMonth,
  resolvePeriod,
};
