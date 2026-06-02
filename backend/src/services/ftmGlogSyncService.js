const { sql, queryFtm, isFtmDatabaseConfigured } = require('../config/ftmDatabase');
const db = require('../config/database');
const {
  toSqlDate,
  toSqlTime,
  upsertAttendanceFromGlogDailyRow,
  tallyUpsertStats,
  emptyAttendanceSyncStats,
} = require('./glogAttendanceService');

const PAGE_SIZE = 5000;
const SYNC_CHUNK = 500;
const MAX_SYNC_DAYS = 31;

const T_DATA_ACCESS = sanitizeTableName(process.env.FTM_DATA_ACCESS_TABLE, 'data_access');
const T_EMPLOYEE = sanitizeTableName(process.env.FTM_EMPLOYEE_TABLE, 'employee');

function sanitizeTableName(raw, fallback) {
  const name = String(raw || fallback).replace(/[^a-zA-Z0-9_]/g, '');
  return name || fallback;
}

function parseIsoDate(raw) {
  const s = String(raw || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function validateDateRange(dateFrom, dateTo) {
  const from = parseIsoDate(dateFrom);
  const to = parseIsoDate(dateTo);
  if (!from || !to) {
    return { error: 'date_from dan date_to wajib format YYYY-MM-DD.' };
  }
  if (from > to) {
    return { error: 'date_from tidak boleh setelah date_to.' };
  }
  const dayCount =
    Math.floor(
      (new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / (24 * 60 * 60 * 1000)
    ) + 1;
  if (dayCount > MAX_SYNC_DAYS) {
    return { error: `Rentang tanggal maksimal ${MAX_SYNC_DAYS} hari.` };
  }
  return { dateFrom: from, dateTo: to, dayCount };
}

/**
 * Tap absensi FTM: data_access INNER JOIN employee (satu-satunya relasi).
 * Join default: employee.pin = data_access.USER_ID → NIK dari employee.nik
 */
async function fetchAccessTapsPage({ dateFrom, dateTo, offset, limit }) {
  const joinCol = sanitizeColumnName(process.env.FTM_EMP_JOIN_COLUMN, 'pin');
  const nikCol = sanitizeColumnName(process.env.FTM_EMP_NIK_COLUMN, 'nik');

  const sqlText = `
    SELECT
      LTRIM(RTRIM(e.${nikCol})) AS nik,
      LTRIM(RTRIM(ISNULL(e.first_name, N'') + N' ' + ISNULL(e.last_name, N''))) AS employee_name,
      CAST(da.[DATE] AS DATE) AS attendance_date,
      CONVERT(VARCHAR(8), da.[TIME], 108) AS event_time
    FROM ${T_DATA_ACCESS} da
    INNER JOIN ${T_EMPLOYEE} e ON e.${joinCol} = da.USER_ID
    WHERE da.[DATE] >= @dateFrom
      AND da.[DATE] < DATEADD(DAY, 1, CAST(@dateTo AS DATE))
      AND da.USER_ID IS NOT NULL
      AND LTRIM(RTRIM(da.USER_ID)) <> N''
      AND e.${nikCol} IS NOT NULL
      AND LTRIM(RTRIM(e.${nikCol})) <> N''
    ORDER BY da.[DATE], da.[TIME], da.USER_ID
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;

  return queryFtm(sqlText, {
    dateFrom: { type: sql.Date, value: dateFrom },
    dateTo: { type: sql.Date, value: dateTo },
    offset: { type: sql.Int, value: offset },
    limit: { type: sql.Int, value: limit },
  });
}

function sanitizeColumnName(raw, fallback) {
  const name = String(raw || fallback).replace(/[^a-zA-Z0-9_]/g, '');
  return name || fallback;
}

/** Agregasi per NIK + tanggal: jam terkecil = masuk, terbesar = pulang. */
function aggregateTapsToDaily(taps) {
  const byKey = new Map();

  for (const row of taps) {
    const nik = String(row.nik || '').trim();
    const attendanceDate = toSqlDate(row.attendance_date);
    const eventTime = toSqlTime(row.event_time);
    if (!nik || !attendanceDate || !eventTime) continue;

    const key = `${nik}|${attendanceDate}`;
    const name =
      String(row.employee_name || '')
        .trim()
        .replace(/\s+/g, ' ') || `FTM ${nik}`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        nik,
        employee_name: name,
        attendance_date: attendanceDate,
        time_in: eventTime,
        time_out: eventTime,
        tap_count: 1,
      });
      continue;
    }

    if (eventTime < existing.time_in) existing.time_in = eventTime;
    if (eventTime > existing.time_out) existing.time_out = eventTime;
    existing.tap_count += 1;
    if (name && !name.startsWith('FTM ') && existing.employee_name.startsWith('FTM ')) {
      existing.employee_name = name;
    }
  }

  return Array.from(byKey.values());
}

async function loadAllTaps(dateFrom, dateTo) {
  const taps = [];
  let offset = 0;

  for (;;) {
    const page = await fetchAccessTapsPage({ dateFrom, dateTo, offset, limit: PAGE_SIZE });
    if (page.length === 0) break;
    taps.push(...page);
    offset += page.length;
    if (page.length < PAGE_SIZE) break;
  }

  return taps;
}

/**
 * Sync FTM → attendance HR (MySQL).
 * Alur: baca tap → agregasi harian → upsert (logic sama upload glog).
 */
async function syncAttendanceFromFtmDataAccess(options = {}) {
  if (!isFtmDatabaseConfigured()) {
    throw new Error('Koneksi FTM belum dikonfigurasi (FTM_DB_* di .env).');
  }

  const range = validateDateRange(options.dateFrom, options.dateTo);
  if (range.error) {
    const err = new Error(range.error);
    err.statusCode = 400;
    throw err;
  }

  const createEmployeeIfUnmatched = Boolean(options.createEmployeeIfUnmatched);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const stats = {
    ...emptyAttendanceSyncStats(),
    date_from: range.dateFrom,
    date_to: range.dateTo,
    ftm_tap_rows_read: 0,
    daily_row_count: 0,
  };

  const taps = await loadAllTaps(range.dateFrom, range.dateTo);
  stats.ftm_tap_rows_read = taps.length;

  const dailyRows = aggregateTapsToDaily(taps);
  stats.daily_row_count = dailyRows.length;

  const hrConn = await db.getConnection();
  try {
    if (onProgress) onProgress(0, dailyRows.length);

    let processed = 0;
    for (let i = 0; i < dailyRows.length; i += SYNC_CHUNK) {
      const chunk = dailyRows.slice(i, i + SYNC_CHUNK);
      for (const row of chunk) {
        const r = await upsertAttendanceFromGlogDailyRow(hrConn, row, { createEmployeeIfUnmatched });
        tallyUpsertStats(stats, r);
        processed += 1;
      }
      if (onProgress) onProgress(processed, dailyRows.length);
    }

    return stats;
  } finally {
    hrConn.release();
  }
}

module.exports = {
  validateDateRange,
  syncAttendanceFromFtmDataAccess,
};
