#!/usr/bin/env node
/**
 * Sync Fingerspot data_access → attendance (proses terpisah dari API).
 * Cron contoh: npm run sync:fingerspot -- --lookback-days=1
 */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  runFingerspotGlogSyncCommand,
  closeFingerspotGlogSyncResources,
} = require('../src/services/fingerspotGlogSyncService');

async function main() {
  const outcome = await runFingerspotGlogSyncCommand(process.argv.slice(2));
  if (!outcome.ok) {
    if (outcome.helpPrinted) process.exit(0);
    console.error(outcome.error || 'Sync Fingerspot gagal.');
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
  .finally(() => closeFingerspotGlogSyncResources());
