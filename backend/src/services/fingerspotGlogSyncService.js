const { queryFingerspot, closeFingerspotPool, isFingerspotDatabaseConfigured } = require('../config/fingerspotDatabase');

const PAGE_SIZE = 5000;
const SYNC_CHUNK = 500;
const MAX_SYNC_DAYS = 31;
const MIN_SHIFT_MINUTES = 6 * 60;
const GLOG_UPSERT_OPTS = { createEmployeeIfUnmatched: false };

const T_DATA_ACCESS = sanitizeIdentifier('data_access');

const FINGERSPOT_SYNC_CLI_COMMAND = 'npm run sync:fingerspot';
const DEFAULT_LOOKBACK_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

function sanitizeIdentifier(raw, fallback) {
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

/** Sanitasi tanggal/jam tap dari hasil query Fingerspot (DATE + TIME). */
function parseFingerspotAccessEvent(dateRaw, timeRaw) {
  const attendanceDate = toSqlDate(dateRaw);
  let eventTime = toSqlTime(timeRaw);
  if (!eventTime && dateRaw != null) {
    const raw = String(dateRaw).trim();
    if (raw.includes(' ')) {
      eventTime = toSqlTime(raw.split(/\s+/).slice(1).join(' '));
    } else if (raw.includes('T')) {
      eventTime = toSqlTime(raw.split('T').slice(1).join('T').replace(/Z$/i, ''));
    }
  }
  return { attendanceDate, eventTime };
}

/**
 * Tap absensi Fingerspot: data_access.
 * Join default: employee.pin = data_access.USER_ID → NPK dari employee.nik
 */
async function fetchDataAccessPage({ dateFrom, dateTo, offset, limit }) {
  const sqlText = `
    SELECT
      TRIM(da.USER_ID) AS nik,
      DATE(da.\`DATE\`) AS access_date,
      TIME(da.\`TIME\`) AS access_time
    FROM ${T_DATA_ACCESS} da
    WHERE da.\`DATE\` >= ?
      AND da.\`DATE\` < DATE_ADD(?, INTERVAL 1 DAY)
      AND da.USER_ID IS NOT NULL
      AND TRIM(da.USER_ID) <> ''
    ORDER BY da.\`DATE\`, da.\`TIME\`, da.USER_ID
    LIMIT ? OFFSET ?`;

  return queryFingerspot(sqlText, [
    `${dateFrom} 00:00:00`,
    dateTo,
    limit,
    offset,
  ]);
}

async function loadAllDataAccessTaps(dateFrom, dateTo) {
  const taps = [];
  let offset = 0;

  for (;;) {
    const page = await fetchDataAccessPage({ dateFrom, dateTo, offset, limit: PAGE_SIZE });
    if (page.length === 0) break;
    taps.push(...page);
    offset += page.length;
    if (page.length < PAGE_SIZE) break;
  }

  return taps;
}

/** Agregasi per NIK + tanggal: jam terkecil = masuk, terbesar = pulang. */
function aggregateDataAccessToDaily(taps) {
  const byKey = new Map();
  let skippedInvalid = 0;

  for (const row of taps) {
    const nik = String(row.nik || '').trim();
    const { attendanceDate, eventTime } = parseFingerspotAccessEvent(row.access_date, row.access_time);
    if (!nik || !attendanceDate || !eventTime) {
      skippedInvalid += 1;
      continue;
    }

    const key = `${nik}|${attendanceDate}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        nik,
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
  }

  const dailyRows = [];
  let skippedShortShift = 0;

  for (const daily of byKey.values()) {
    if (shiftDurationMinutes(daily.time_in, daily.time_out) < MIN_SHIFT_MINUTES) {
      skippedShortShift += 1;
      continue;
    }
    dailyRows.push(daily);
  }

  return { dailyRows, skippedInvalid, skippedShortShift };
}

/**
 * Sync Fingerspot data_access → attendance (tanpa staging).
 */
async function syncAttendanceFromFingerspotDataAccess(options = {}) {
  if (!isFingerspotDatabaseConfigured()) {
    throw new Error('Database Fingerspot (SQL Server / data_access) belum dikonfigurasi (FINGERSPOT_DB_* di .env).');
  }

  const range = validateDateRange(options.dateFrom, options.dateTo);
  if (range.error) {
    const err = new Error(range.error);
    err.statusCode = 400;
    throw err;
  }

  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const stats = {
    ...emptyAttendanceSyncStats(),
    date_from: range.dateFrom,
    date_to: range.dateTo,
    data_access_rows_read: 0,
    daily_row_count: 0,
    attendance_skipped_short_shift: 0,
    attendance_skipped_invalid_scan: 0,
  };

  const taps = await loadAllDataAccessTaps(range.dateFrom, range.dateTo);
  stats.data_access_rows_read = taps.length;

  const { dailyRows, skippedInvalid, skippedShortShift } = aggregateDataAccessToDaily(taps);
  stats.daily_row_count = dailyRows.length;
  stats.attendance_skipped_invalid_scan = skippedInvalid;
  stats.attendance_skipped_short_shift = skippedShortShift;

  const hrConn = await db.getConnection();
  try {
    if (onProgress) onProgress(0, dailyRows.length);

    let processed = 0;
    for (let i = 0; i < dailyRows.length; i += SYNC_CHUNK) {
      const chunk = dailyRows.slice(i, i + SYNC_CHUNK);
      for (const row of chunk) {
        const r = await upsertAttendanceFromGlogDailyRow(hrConn, row, GLOG_UPSERT_OPTS);
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

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function toYmdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveSyncDateRange(options = {}) {
  if (options.dateFrom && options.dateTo) {
    const range = validateDateRange(options.dateFrom, options.dateTo);
    if (range.error) throw new Error(range.error);
    return { dateFrom: range.dateFrom, dateTo: range.dateTo };
  }

  const lookbackDays = parsePositiveInt(
    options.lookbackDays ?? process.env.ATT_SYNC_FINGERSPOT_LOOKBACK_DAYS,
    DEFAULT_LOOKBACK_DAYS
  );
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - (lookbackDays - 1) * DAY_MS);
  return { dateFrom: toYmdLocal(fromDate), dateTo: toYmdLocal(toDate), lookbackDays };
}

async function runFingerspotGlogSyncPipeline(options = {}) {
  const range = resolveSyncDateRange(options);
  const attendance = await syncAttendanceFromFingerspotDataAccess({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    onProgress: options.onProgress,
  });

  return {
    date_from: range.dateFrom,
    date_to: range.dateTo,
    lookback_days: range.lookbackDays ?? null,
    ...attendance,
  };
}

function printFingerspotSyncCliHelp() {
  const lines = [
    'Usage: npm run sync:fingerspot -- [options]',
    '',
    'Options:',
    '  --date-from=YYYY-MM-DD   Rentang tanggal (wajib berpasangan dengan --date-to)',
    '  --date-to=YYYY-MM-DD',
    '  --lookback-days=N        Default 1 hari jika tanggal tidak diisi',
    '  --help                   Tampilkan bantuan ini',
    '',
    'Alur: Fingerspot data_access → agregasi harian → attendance',
    '',
    'Contoh cron:',
    '  npm run sync:fingerspot -- --lookback-days=1',
    '  npm run sync:fingerspot -- --date-from=2026-06-01 --date-to=2026-06-04',
  ];
  console.log(lines.join('\n'));
}

function parseFingerspotSyncCliArgs(argv = []) {
  const opts = {
    dateFrom: null,
    dateTo: null,
    lookbackDays: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      opts.help = true;
      continue;
    }

    const eq = token.match(/^--([^=]+)=(.*)$/);
    if (eq) {
      applyCliFlag(opts, eq[1], eq[2]);
      continue;
    }
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('--')) {
        applyCliFlag(opts, key, next);
        i += 1;
      }
    }
  }

  return opts;
}

function applyCliFlag(opts, key, value) {
  const k = key.replace(/-/g, '_');
  if (k === 'date_from') opts.dateFrom = value;
  else if (k === 'date_to') opts.dateTo = value;
  else if (k === 'lookback_days') opts.lookbackDays = parsePositiveInt(value, DEFAULT_LOOKBACK_DAYS);
}

async function runFingerspotGlogSyncCommand(argv = []) {
  const parsed = parseFingerspotSyncCliArgs(argv);
  if (parsed.help) {
    printFingerspotSyncCliHelp();
    return { ok: true, helpPrinted: true, result: null };
  }

  if ((parsed.dateFrom && !parsed.dateTo) || (!parsed.dateFrom && parsed.dateTo)) {
    return {
      ok: false,
      exitCode: 1,
      error: 'date-from dan date-to harus diisi berpasangan.',
    };
  }

  try {
    const startedAt = Date.now();
    const result = await runFingerspotGlogSyncPipeline({
      dateFrom: parsed.dateFrom || undefined,
      dateTo: parsed.dateTo || undefined,
      lookbackDays: parsed.lookbackDays,
    });
    return {
      ok: true,
      result: {
        ...result,
        duration_ms: Date.now() - startedAt,
      },
    };
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      error: err.message || String(err),
    };
  }
}

async function closeFingerspotGlogSyncResources() {
  try {
    await closeFingerspotPool();
  } catch (_) {
    /* no-op */
  }
  try {
    await db.end();
  } catch (_) {
    /* no-op */
  }
}

module.exports = {
  FINGERSPOT_SYNC_CLI_COMMAND,
  validateDateRange,
  parseFingerspotAccessEvent,
  syncAttendanceFromFingerspotDataAccess,
  runFingerspotGlogSyncPipeline,
  runFingerspotGlogSyncCommand,
  parseFingerspotSyncCliArgs,
  printFingerspotSyncCliHelp,
  closeFingerspotGlogSyncResources,
};
