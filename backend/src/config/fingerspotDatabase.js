const sql = require('mssql');
require('dotenv').config();

/**
 * Koneksi SQL Server — database Fingerspot (tabel data_access).
 * Env: FINGERSPOT_DB_HOST, FINGERSPOT_DB_PORT, FINGERSPOT_DB_USER, FINGERSPOT_DB_PASSWORD, FINGERSPOT_DB_NAME
 * Opsional: FINGERSPOT_DB_ENCRYPT, FINGERSPOT_DB_TRUST_CERT
 */
function buildConfig() {
  return {
    server: process.env.FINGERSPOT_DB_HOST,
    port: parseInt(process.env.FINGERSPOT_DB_PORT || '1433', 10),
    user: process.env.FINGERSPOT_DB_USER,
    password: process.env.FINGERSPOT_DB_PASSWORD,
    database: process.env.FINGERSPOT_DB_NAME,
    options: {
      encrypt: String(process.env.FINGERSPOT_DB_ENCRYPT || 'false').toLowerCase() === 'true',
      trustServerCertificate:
        String(process.env.FINGERSPOT_DB_TRUST_CERT || 'true').toLowerCase() !== 'false',
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

let poolPromise = null;

function isFingerspotDatabaseConfigured() {
  return Boolean(
    process.env.FINGERSPOT_DB_HOST && process.env.FINGERSPOT_DB_USER && process.env.FINGERSPOT_DB_NAME
  );
}

async function getFingerspotPool() {
  if (!isFingerspotDatabaseConfigured()) {
    throw new Error('Database Fingerspot belum dikonfigurasi (FINGERSPOT_DB_* di .env).');
  }
  if (!poolPromise) {
    poolPromise = sql.connect(buildConfig());
  }
  return poolPromise;
}

/**
 * @param {string} queryText T-SQL dengan parameter @nama
 * @param {Record<string, { type: import('mssql').ISqlTypeFactoryWithNoParams, value: unknown }>} inputs
 */
async function queryFingerspot(queryText, inputs = {}) {
  const pool = await getFingerspotPool();
  const request = pool.request();
  for (const [name, { type, value }] of Object.entries(inputs)) {
    request.input(name, type, value);
  }
  const result = await request.query(queryText);
  return result.recordset || [];
}

async function closeFingerspotPool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
  }
}

module.exports = {
  sql,
  getFingerspotPool,
  queryFingerspot,
  closeFingerspotPool,
  isFingerspotDatabaseConfigured,
};
