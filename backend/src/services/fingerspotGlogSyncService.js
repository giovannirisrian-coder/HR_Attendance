const fingerspotDb = require('../config/fingerspotDatabase');
const { isFingerspotDatabaseConfigured } = fingerspotDb;
const db = require('../config/database');
const {
  toSqlDate,
  toSqlTime,
  shiftDurationMinutes,
  upsertAttendanceFromGlogDailyRow,
  tallyUpsertStats,
  emptyAttendanceSyncStats,
} = require('./glogAttendanceService');
const { validateDateRange } = require('./ftmGlogSyncService');

const FETCH_CHUNK = 5000;
const SYNC_CHUNK = 500;
const MIN_SHIFT_MINUTES = 6 * 60;

const ATT_LOG_TABLE = String(process.env.FINGERSPOT_ATT_LOG_TABLE || 'att_log').replace(/[^a-zA-Z0-9_]/g, '');
const DATE_SCAN_COLUMN = String(process.env.FINGERSPOT_DATE_SCAN_COLUMN || 'date_scan').replace(
  /[^a-zA-Z0-9_]/g,
  ''
);

async function loadPinToNikMap(hrConn) {
  const [rows] = await hrConn.query(
    `SELECT e.nik, e.pin
     FROM employees e
     INNER JOIN users u ON u.id = e.user_id AND u.role = 'ls' AND u.is_active = 1
     WHERE e.pin IS NOT NULL OR e.nik IS NOT NULL`
  );
  const map = new Map();
  for (const row of rows) {
    const nik = String(row.nik || '').trim();
    if (!nik) continue;
    const pin = String(row.pin || '').trim();
    if (pin) map.set(pin, nik);
    map.set(nik, nik);
  }
  return map;
}

async function fetchAttLogPage(fsConn, { dateFrom, dateTo, offset, limit }) {
  const sql = `
    SELECT
      al.pin,
      DATE(al.\`${DATE_SCAN_COLUMN}\`) AS attendance_date,
      TIME(al.\`${DATE_SCAN_COLUMN}\`) AS event_time
    FROM \`${ATT_LOG_TABLE}\` al
    WHERE al.\`${DATE_SCAN_COLUMN}\` >= ?
      AND al.\`${DATE_SCAN_COLUMN}\` < DATE_ADD(?, INTERVAL 1 DAY)
      AND al.pin IS NOT NULL
      AND TRIM(al.pin) <> ''
    ORDER BY al.\`${DATE_SCAN_COLUMN}\`, al.pin
    LIMIT ? OFFSET ?`;
  const [rows] = await fsConn.query(sql, [`${dateFrom} 00:00:00`, dateTo, limit, offset]);
  return rows;
}

function aggregateAttLogToDailyRows(tapRows, pinToNik) {
  const map = new Map();
  for (const row of tapRows) {
    const pin = String(row.pin || '').trim();
    const attendanceDate = toSqlDate(row.attendance_date);
    const eventTime = toSqlTime(row.event_time);
    if (!pin || !attendanceDate || !eventTime) continue;

    const nik = pinToNik.get(pin) || pin;
    const key = `${nik}|${attendanceDate}`;
    let agg = map.get(key);
    if (!agg) {
      map.set(key, {
        nik,
        employee_name: '',
        attendance_date: attendanceDate,
        time_in: eventTime,
        time_out: eventTime,
        tap_count: 1,
      });
      continue;
    }
    if (eventTime < agg.time_in) agg.time_in = eventTime;
    if (eventTime > agg.time_out) agg.time_out = eventTime;
    agg.tap_count += 1;
  }
  return Array.from(map.values());
}

function filterByMinShiftDuration(dailyRows) {
  const accepted = [];
  let skippedShortShift = 0;
  for (const row of dailyRows) {
    const minutes = shiftDurationMinutes(row.time_in, row.time_out);
    if (minutes < MIN_SHIFT_MINUTES) {
      skippedShortShift += 1;
      continue;
    }
    accepted.push(row);
  }
  return { accepted, skippedShortShift };
}

async function syncAttendanceFromFingerspotAttLog(options = {}) {
  if (!isFingerspotDatabaseConfigured()) {
    throw new Error('Koneksi Fingerspot belum dikonfigurasi (FINGERSPOT_DB_* di .env).');
  }

  const range = validateDateRange(options.dateFrom, options.dateTo);
  if (range.error) {
    const err = new Error(range.error);
    err.statusCode = 400;
    throw err;
  }

  const createEmployeeIfUnmatched = Boolean(options.createEmployeeIfUnmatched);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const fsConn = await fingerspotDb.getConnection();
  const hrConn = await db.getConnection();

  const stats = {
    ...emptyAttendanceSyncStats(),
    date_from: range.dateFrom,
    date_to: range.dateTo,
    fingerspot_tap_rows_read: 0,
    daily_row_count: 0,
    attendance_skipped_short_shift: 0,
  };

  try {
    const pinToNik = await loadPinToNikMap(hrConn);
    const allTaps = [];
    let offset = 0;
    for (;;) {
      const page = await fetchAttLogPage(fsConn, {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        offset,
        limit: FETCH_CHUNK,
      });
      if (page.length === 0) break;
      allTaps.push(...page);
      stats.fingerspot_tap_rows_read += page.length;
      offset += page.length;
      if (page.length < FETCH_CHUNK) break;
    }

    const aggregated = aggregateAttLogToDailyRows(allTaps, pinToNik);
    const { accepted, skippedShortShift } = filterByMinShiftDuration(aggregated);
    stats.daily_row_count = accepted.length;
    stats.attendance_skipped_short_shift = skippedShortShift;

    if (onProgress) onProgress(0, accepted.length);

    let processed = 0;
    for (let i = 0; i < accepted.length; i += SYNC_CHUNK) {
      const chunk = accepted.slice(i, i + SYNC_CHUNK);
      for (const row of chunk) {
        const r = await upsertAttendanceFromGlogDailyRow(hrConn, row, { createEmployeeIfUnmatched });
        tallyUpsertStats(stats, r);
        processed += 1;
      }
      if (onProgress) onProgress(processed, accepted.length);
    }

    return stats;
  } finally {
    fsConn.release();
    hrConn.release();
  }
}

module.exports = {
  syncAttendanceFromFingerspotAttLog,
  isFingerspotDatabaseConfigured,
};
