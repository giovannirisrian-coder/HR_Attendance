/** Server-local calendar YYYY-MM-DD (no UTC midnight drift for business dates). */
const getServerLocalYmd = () => {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const CAL_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Normalize request body values to strict YYYY-MM-DD calendar strings for MySQL DATE columns.
 * Accepts plain date strings or Date instances (uses the server's local calendar for Date).
 */
const normalizeCalendarYmdFromBody = (raw) => {
  let candidate;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    candidate = `${y}-${m}-${d}`;
  } else {
    candidate = String(raw ?? '').trim().slice(0, 10);
  }
  const m = candidate.match(CAL_YMD);
  if (!m) {
    return { ok: false, ymd: null, error: 'Invalid date. Use calendar format YYYY-MM-DD.' };
  }
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const check = new Date(y, mo - 1, day);
  if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== day) {
    return { ok: false, ymd: null, error: 'Invalid calendar date.' };
  }
  return { ok: true, ymd: candidate, error: null };
};

/** LS attendance: allowed from 10 calendar days ago through today (server local). */
const getAttendanceYmdBounds = () => {
  const today = getServerLocalYmd();
  const [y, mo, d] = today.split('-').map((x) => parseInt(x, 10));
  const minDt = new Date(y, mo - 1, d - 10);
  const yy = minDt.getFullYear();
  const mm = String(minDt.getMonth() + 1).padStart(2, '0');
  const dd = String(minDt.getDate()).padStart(2, '0');
  return { minYmd: `${yy}-${mm}-${dd}`, maxYmd: today };
};

const assertYmdInInclusiveRange = (ymd, minYmd, maxYmd, message) => {
  if (ymd < minYmd || ymd > maxYmd) return message;
  return null;
};

const compareYmd = (a, b) => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

module.exports = {
  getServerLocalYmd,
  normalizeCalendarYmdFromBody,
  getAttendanceYmdBounds,
  assertYmdInInclusiveRange,
  compareYmd,
};
