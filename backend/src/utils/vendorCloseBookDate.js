/**
 * Vendor close-book date helpers.
 *
 * close_book_date values:
 *   1–27  → period runs from day N of the previous calendar month
 *           through day (N−1) of the report month.
 *   28    → "End of the month": last day of previous month through
 *           the second-to-last day of the report month.
 */

const CLOSE_BOOK_EOM = 28;

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function toYmd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Normalize stored / API value to 1–27 or 28 (end of month). */
function normalizeCloseBookDate(val) {
  if (val == null || val === '') return 1;
  const s = String(val).trim().toLowerCase();
  if (s === 'eom' || s === 'end_of_month' || s === 'end of the month' || s === 'end of month') {
    return CLOSE_BOOK_EOM;
  }
  const n = parseInt(val, 10);
  if (n === CLOSE_BOOK_EOM) return CLOSE_BOOK_EOM;
  if (n >= 1 && n <= 27) return n;
  return 1;
}

/** Human label for UI / PDF. */
function closeBookDateLabel(val) {
  const n = normalizeCloseBookDate(val);
  if (n === CLOSE_BOOK_EOM) return 'End of the month';
  return String(n);
}

/**
 * Calculate inclusive reporting window for a labelled report month/year.
 * @returns {{ startDate: string, endDate: string }}
 */
function calcVendorReportDateRange(closeBookDate, reportMonth, reportYear) {
  const month = Math.min(12, Math.max(1, parseInt(reportMonth, 10) || 1));
  const year = parseInt(reportYear, 10);
  const cfg = normalizeCloseBookDate(closeBookDate);

  if (cfg === 1) {
    const lastDay = daysInMonth(year, month);
    return {
      startDate: toYmd(year, month, 1),
      endDate: toYmd(year, month, lastDay),
    };
  }

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  if (cfg === CLOSE_BOOK_EOM) {
    const prevLast = daysInMonth(prevYear, prevMonth);
    const currLast = daysInMonth(year, month);
    return {
      startDate: toYmd(prevYear, prevMonth, prevLast),
      endDate: toYmd(year, month, currLast - 1),
    };
  }

  const endDay = cfg - 1;
  return {
    startDate: toYmd(prevYear, prevMonth, cfg),
    endDate: toYmd(year, month, endDay),
  };
}

function formatYmdDisplay(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return ymd;
  return `${d} ${MONTH_NAMES_SHORT[m - 1]} ${y}`;
}

function formatPeriodRangeLabel(startDate, endDate) {
  return `${formatYmdDisplay(startDate)} – ${formatYmdDisplay(endDate)}`;
}

/** API payload value: number 1–28 or string 'eom'. */
function serializeCloseBookDateForApi(stored) {
  const n = normalizeCloseBookDate(stored);
  return n === CLOSE_BOOK_EOM ? 'eom' : n;
}

/** DB storage value (TINYINT). */
function serializeCloseBookDateForDb(input) {
  return normalizeCloseBookDate(input);
}

module.exports = {
  CLOSE_BOOK_EOM,
  normalizeCloseBookDate,
  closeBookDateLabel,
  calcVendorReportDateRange,
  formatPeriodRangeLabel,
  formatYmdDisplay,
  serializeCloseBookDateForApi,
  serializeCloseBookDateForDb,
};
