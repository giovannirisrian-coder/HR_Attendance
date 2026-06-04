const { FTM_SYNC_CLI_COMMAND } = require('./ftmGlogSyncService');
const { FINGERSPOT_SYNC_CLI_COMMAND } = require('./fingerspotGlogSyncService');

const DEFAULT_LOOKBACK_DAYS = 1;

const runtime = {
  ftm: {
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
  },
  fingerspot: {
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
  },
};

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function startFtmScheduler() {
  runtime.ftm.lookbackDays = parsePositiveInt(
    process.env.ATT_SYNC_FTM_LOOKBACK_DAYS,
    DEFAULT_LOOKBACK_DAYS
  );
}

function startFingerspotScheduler() {
  runtime.fingerspot.lookbackDays = parsePositiveInt(
    process.env.ATT_SYNC_FINGERSPOT_LOOKBACK_DAYS,
    DEFAULT_LOOKBACK_DAYS
  );
}

function startAttendanceSyncSchedulers() {
  startFtmScheduler();
  startFingerspotScheduler();
}

function stopAttendanceSyncSchedulers() {
  /* sync dijalankan via cron CLI, bukan timer di proses API */
}

/** FTM sync hanya via CLI — tidak dijalankan di proses API. */
async function runFtmSync() {
  return {
    started: false,
    skipped: true,
    reason: `Sync FTM hanya via command: ${FTM_SYNC_CLI_COMMAND}`,
    cli_command: FTM_SYNC_CLI_COMMAND,
  };
}

/** Fingerspot sync hanya via CLI — tidak dijalankan di proses API. */
async function runFingerspotSync() {
  return {
    started: false,
    skipped: true,
    reason: `Sync Fingerspot hanya via command: ${FINGERSPOT_SYNC_CLI_COMMAND}`,
    cli_command: FINGERSPOT_SYNC_CLI_COMMAND,
  };
}

function getSchedulerStatus() {
  return {
    ftm: {
      mode: 'cli_only',
      cli_command: FTM_SYNC_CLI_COMMAND,
      lookback_days: runtime.ftm.lookbackDays,
      hint: 'Jadwalkan via cron/systemd, bukan interval di proses API.',
    },
    fingerspot: {
      mode: 'cli_only',
      cli_command: FINGERSPOT_SYNC_CLI_COMMAND,
      lookback_days: runtime.fingerspot.lookbackDays,
      hint: 'Jadwalkan via cron/systemd, bukan interval di proses API.',
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
