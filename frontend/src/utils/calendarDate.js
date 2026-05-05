/**
 * Calendar-date helpers: avoid treating plain dates as UTC midnight (off-by-one in some timezones).
 */

/** @param {Date} [d] */
export function formatYmdLocal(d = new Date()) {
  const n = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const day = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Derive YYYY-MM-DD for display from API values (plain date string, ISO datetime, or Date).
 * Uses the browser's local calendar when parsing datetimes.
 */
export function toYmdFromApiValue(input) {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input === 'string') {
    const plain = input.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (plain) return plain[1];
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return formatYmdLocal(d);
}

/**
 * @param {string|Date|number} input
 * @param {string} [locale]
 * @param {Intl.DateTimeFormatOptions} [opts]
 */
export function formatCalendarDateLocale(input, locale = 'en-ID', opts = {}) {
  const ymd = toYmdFromApiValue(input);
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const localNoon = new Date(y, m - 1, d, 12, 0, 0);
  return localNoon.toLocaleDateString(locale, opts);
}

/** @param {string} ymd */
export function addDaysToYmdLocal(ymd, deltaDays) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo, d + deltaDays);
  return formatYmdLocal(dt);
}
