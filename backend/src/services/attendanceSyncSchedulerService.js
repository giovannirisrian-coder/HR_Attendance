const { syncAttendanceFromFtmDataAccess } = require('./ftmGlogSyncService');
const { syncAttendanceFromFingerspotAttLog } = require('./fingerspotGlogSyncService');
const { isFtmDatabaseConfigured } = require('../config/ftmDatabase');
const fingerspotDb = require('../config/fingerspotDatabase');

const { isFingerspotDatabaseConfigured } = fingerspotDb;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 1;

const runtime = {
  ftm: {
    timer: null,
    running: false,
    intervalMs: 0,
    lookbackDays: 1,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
    lastResult: null,
    lastReason: null,
  },
  fingerspot: {
    timer: null,
    running: false,
    intervalMs: 0,
    lookbackDays: 1,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
    lastResult: null,
    lastReason: null,
  },
};

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function envBool(raw, fallback = false) {
  if (raw == null) return fallback;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y';
}

function toYmdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDateRangeFromLookback(lookbackDays) {
  const safeDays = Math.max(1, parsePositiveInt(lookbackDays, DEFAULT_LOOKBACK_DAYS));
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - (safeDays - 1) * DAY_MS);
  return {
    dateFrom: toYmdLocal(fromDate),
    dateTo: toYmdLocal(toDate),
  };
}

async function runFtmSync(options = {}) {
  if (runtime.ftm.running) {
    return { started: false, skipped: true, reason: 'FTM scheduler is already running.' };
  }
  if (!isFtmDatabaseConfigured()) {
    return { started: false, skipped: true, reason: 'FTM DB is not configured.' };
  }

  const createEmployeeIfUnmatched =
    options.createEmployeeIfUnmatched != null
      ? Boolean(options.createEmployeeIfUnmatched)
      : envBool(process.env.ATT_SYNC_FTM_CREATE_EMPLOYEES, false);
  const range =
    options.dateFrom && options.dateTo
      ? { dateFrom: options.dateFrom, dateTo: options.dateTo }
      : buildDateRangeFromLookback(runtime.ftm.lookbackDays);

  runtime.ftm.running = true;
  runtime.ftm.lastReason = options.reason || 'scheduler';
  runtime.ftm.lastStartedAt = new Date().toISOString();
  runtime.ftm.lastError = null;
  try {
    const result = await syncAttendanceFromFtmDataAccess({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      createEmployeeIfUnmatched,
    });
    runtime.ftm.lastResult = result;
    return { started: true, skipped: false, result };
  } catch (err) {
    runtime.ftm.lastError = err.message || 'FTM sync failed.';
    throw err;
  } finally {
    runtime.ftm.running = false;
    runtime.ftm.lastFinishedAt = new Date().toISOString();
  }
}

async function runFingerspotSync(options = {}) {
  if (runtime.fingerspot.running) {
    return { started: false, skipped: true, reason: 'Fingerspot scheduler is already running.' };
  }
  if (!isFingerspotDatabaseConfigured()) {
    return { started: false, skipped: true, reason: 'Fingerspot DB is not configured.' };
  }

  const createEmployeeIfUnmatched =
    options.createEmployeeIfUnmatched != null
      ? Boolean(options.createEmployeeIfUnmatched)
      : envBool(process.env.ATT_SYNC_FINGERSPOT_CREATE_EMPLOYEES, false);
  const range =
    options.dateFrom && options.dateTo
      ? { dateFrom: options.dateFrom, dateTo: options.dateTo }
      : buildDateRangeFromLookback(runtime.fingerspot.lookbackDays);

  runtime.fingerspot.running = true;
  runtime.fingerspot.lastReason = options.reason || 'scheduler';
  runtime.fingerspot.lastStartedAt = new Date().toISOString();
  runtime.fingerspot.lastError = null;
  try {
    const result = await syncAttendanceFromFingerspotAttLog({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      createEmployeeIfUnmatched,
    });
    runtime.fingerspot.lastResult = result;
    return { started: true, skipped: false, result };
  } catch (err) {
    runtime.fingerspot.lastError = err.message || 'Fingerspot sync failed.';
    throw err;
  } finally {
    runtime.fingerspot.running = false;
    runtime.fingerspot.lastFinishedAt = new Date().toISOString();
  }
}

function clearSchedulerTimer(timerRef) {
  if (timerRef) clearInterval(timerRef);
  return null;
}

function startFtmScheduler() {
  runtime.ftm.timer = clearSchedulerTimer(runtime.ftm.timer);
  const enabled = envBool(process.env.ATT_SYNC_FTM_ENABLED, false);
  runtime.ftm.intervalMs = parsePositiveInt(process.env.ATT_SYNC_FTM_INTERVAL_MS, DEFAULT_INTERVAL_MS);
  runtime.ftm.lookbackDays = parsePositiveInt(
    process.env.ATT_SYNC_FTM_LOOKBACK_DAYS,
    DEFAULT_LOOKBACK_DAYS
  );
  if (!enabled) return;
  setImmediate(() => {
    runFtmSync({ reason: 'scheduler_bootstrap' }).catch((err) => {
      console.error('FTM scheduler bootstrap sync error:', err);
    });
  });
  runtime.ftm.timer = setInterval(() => {
    runFtmSync({ reason: 'scheduler_interval' }).catch((err) => {
      console.error('FTM scheduler interval sync error:', err);
    });
  }, runtime.ftm.intervalMs);
}

function startFingerspotScheduler() {
  runtime.fingerspot.timer = clearSchedulerTimer(runtime.fingerspot.timer);
  const enabled = envBool(process.env.ATT_SYNC_FINGERSPOT_ENABLED, false);
  runtime.fingerspot.intervalMs = parsePositiveInt(
    process.env.ATT_SYNC_FINGERSPOT_INTERVAL_MS,
    DEFAULT_INTERVAL_MS
  );
  runtime.fingerspot.lookbackDays = parsePositiveInt(
    process.env.ATT_SYNC_FINGERSPOT_LOOKBACK_DAYS,
    DEFAULT_LOOKBACK_DAYS
  );
  if (!enabled) return;
  setImmediate(() => {
    runFingerspotSync({ reason: 'scheduler_bootstrap' }).catch((err) => {
      console.error('Fingerspot scheduler bootstrap sync error:', err);
    });
  });
  runtime.fingerspot.timer = setInterval(() => {
    runFingerspotSync({ reason: 'scheduler_interval' }).catch((err) => {
      console.error('Fingerspot scheduler interval sync error:', err);
    });
  }, runtime.fingerspot.intervalMs);
}

function startAttendanceSyncSchedulers() {
  startFtmScheduler();
  startFingerspotScheduler();
}

function stopAttendanceSyncSchedulers() {
  runtime.ftm.timer = clearSchedulerTimer(runtime.ftm.timer);
  runtime.fingerspot.timer = clearSchedulerTimer(runtime.fingerspot.timer);
}

function getSchedulerStatus() {
  return {
    ftm: {
      enabled: envBool(process.env.ATT_SYNC_FTM_ENABLED, false),
      running: runtime.ftm.running,
      interval_ms: runtime.ftm.intervalMs,
      lookback_days: runtime.ftm.lookbackDays,
      last_started_at: runtime.ftm.lastStartedAt,
      last_finished_at: runtime.ftm.lastFinishedAt,
      last_reason: runtime.ftm.lastReason,
      last_error: runtime.ftm.lastError,
      last_result: runtime.ftm.lastResult,
    },
    fingerspot: {
      enabled: envBool(process.env.ATT_SYNC_FINGERSPOT_ENABLED, false),
      running: runtime.fingerspot.running,
      interval_ms: runtime.fingerspot.intervalMs,
      lookback_days: runtime.fingerspot.lookbackDays,
      last_started_at: runtime.fingerspot.lastStartedAt,
      last_finished_at: runtime.fingerspot.lastFinishedAt,
      last_reason: runtime.fingerspot.lastReason,
      last_error: runtime.fingerspot.lastError,
      last_result: runtime.fingerspot.lastResult,
    },
  };
}

module.exports = {
  runFtmSync,
  runFingerspotSync,
  startFtmScheduler,
  startFingerspotScheduler,
  startAttendanceSyncSchedulers,
  stopAttendanceSyncSchedulers,
  getSchedulerStatus,
};
