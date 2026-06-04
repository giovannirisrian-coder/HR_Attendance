#!/usr/bin/env node
/**
 * Sync FTM att_log → attendance (proses terpisah dari API).
 * Cron contoh: npm run sync:ftm -- --lookback-days=1
 */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  runFtmGlogSyncCommand,
  closeFtmGlogSyncResources,
} = require('../src/services/ftmGlogSyncService');

async function main() {
  const outcome = await runFtmGlogSyncCommand(process.argv.slice(2));
  if (!outcome.ok) {
    if (outcome.helpPrinted) process.exit(0);
    console.error(outcome.error || 'Sync FTM gagal.');
    process.exit(outcome.exitCode || 1);
  }
  console.log(JSON.stringify(outcome.result, null, 2));
  process.exit(0);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  })
  .finally(() => closeFtmGlogSyncResources());
