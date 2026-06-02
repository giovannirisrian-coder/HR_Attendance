const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Pool koneksi ke database Fingerspot (tabel att_log).
 * Env: FINGERSPOT_DB_HOST, FINGERSPOT_DB_PORT, FINGERSPOT_DB_USER, FINGERSPOT_DB_PASSWORD, FINGERSPOT_DB_NAME
 */
const fingerspotPool = mysql.createPool({
  host: process.env.FINGERSPOT_DB_HOST,
  port: process.env.FINGERSPOT_DB_PORT,
  user: process.env.FINGERSPOT_DB_USER,
  password: process.env.FINGERSPOT_DB_PASSWORD,
  database: process.env.FINGERSPOT_DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  timezone: '+08:00',
  dateStrings: true,
});

function isFingerspotDatabaseConfigured() {
  const host = process.env.FINGERSPOT_DB_HOST;
  const user = process.env.FINGERSPOT_DB_USER;
  const name = process.env.FINGERSPOT_DB_NAME;
  return Boolean(host && user && name);
}

module.exports = fingerspotPool;
module.exports.isFingerspotDatabaseConfigured = isFingerspotDatabaseConfigured;
