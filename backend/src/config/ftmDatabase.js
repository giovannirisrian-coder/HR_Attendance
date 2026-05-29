const sql = require('mssql');
require('dotenv').config();

/**
 * Koneksi SQL Server — database FTM (tabel data_access, employee).
 * Env: FTM_DB_HOST, FTM_DB_PORT, FTM_DB_USER, FTM_DB_PASSWORD, FTM_DB_NAME
 * Opsional: FTM_DB_ENCRYPT, FTM_DB_TRUST_CERT
 */
function buildConfig() {
  return {
    server: process.env.FTM_DB_HOST,
    port: parseInt(process.env.FTM_DB_PORT || '1433', 10),
    user: process.env.FTM_DB_USER,
    password: process.env.FTM_DB_PASSWORD,
    database: process.env.FTM_DB_NAME,
    options: {
      encrypt: String(process.env.FTM_DB_ENCRYPT || 'false').toLowerCase() === 'true',
      trustServerCertificate:
        String(process.env.FTM_DB_TRUST_CERT || 'true').toLowerCase() !== 'false',
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

let poolPromise = null;

function isFtmDatabaseConfigured() {
  return Boolean(process.env.FTM_DB_HOST && process.env.FTM_DB_USER && process.env.FTM_DB_NAME);
}

async function getFtmPool() {
  if (!isFtmDatabaseConfigured()) {
    throw new Error('Database FTM belum dikonfigurasi (FTM_DB_* di .env).');
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
async function queryFtm(queryText, inputs = {}) {
  const pool = await getFtmPool();
  const request = pool.request();
  for (const [name, { type, value }] of Object.entries(inputs)) {
    request.input(name, type, value);
  }
  const result = await request.query(queryText);
  return result.recordset || [];
}

async function closeFtmPool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
  }
}

module.exports = {
  sql,
  getFtmPool,
  queryFtm,
  closeFtmPool,
  isFtmDatabaseConfigured,
};
