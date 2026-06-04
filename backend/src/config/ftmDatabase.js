const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Pool koneksi MySQL — database FTM (tabel att_log, dll.).
 * Env: FTM_DB_HOST, FTM_DB_PORT, FTM_DB_USER, FTM_DB_PASSWORD, FTM_DB_NAME
 */
const ftmPool = mysql.createPool({
  host: process.env.FTM_DB_HOST,
  port: process.env.FTM_DB_PORT,
  user: process.env.FTM_DB_USER,
  password: process.env.FTM_DB_PASSWORD,
  database: process.env.FTM_DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  timezone: '+08:00',
  dateStrings: true,
});

function isFtmDatabaseConfigured() {
  const host = process.env.FTM_DB_HOST;
  const user = process.env.FTM_DB_USER;
  const name = process.env.FTM_DB_NAME;
  return Boolean(host && user && name);
}

/**
 * @param {string} sqlText Query MySQL dengan placeholder ?
 * @param {unknown[]} params
 */
async function queryFtm(sqlText, params = []) {
  const [rows] = await ftmPool.query(sqlText, params);
  return rows;
}

async function closeFtmPool() {
  await ftmPool.end();
}

module.exports = ftmPool;
module.exports.queryFtm = queryFtm;
module.exports.closeFtmPool = closeFtmPool;
module.exports.isFtmDatabaseConfigured = isFtmDatabaseConfigured;
