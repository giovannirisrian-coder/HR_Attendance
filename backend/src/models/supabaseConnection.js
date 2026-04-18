/**
 * Optional PostgreSQL connection (e.g. Supabase).
 * This is separate from MySQL (`src/config/database.js`) and does not replace it.
 *
 * Configure one of:
 *   - SUPABASE_DATABASE_URL — full `postgresql://...` connection string (recommended)
 *   - DATABASE_URL — same format (common on hosted platforms)
 *   - SUPABASE_URL — only used when the value starts with `postgresql://` or `postgres://`
 *
 * @module models/supabaseConnection
 */

const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

/**
 * Resolves the Postgres connection string from environment (Supabase-compatible).
 * @returns {string}
 */
function resolveSupabasePostgresUrl() {
  const candidates = [
    process.env.SUPABASE_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.SUPABASE_URL,
  ].filter(Boolean);

  for (const c of candidates) {
    const t = String(c).trim();
    if (t.startsWith('postgresql://') || t.startsWith('postgres://')) {
      return t;
    }
  }
  return '';
}

/**
 * Returns a singleton `pg.Pool` for Supabase Postgres, or `null` if no URL is configured.
 * Safe to call repeatedly; does not connect until a query is run.
 * @returns {import('pg').Pool | null}
 */
function getSupabasePool() {
  const connectionString = resolveSupabasePostgresUrl();
  if (!connectionString) return null;

  if (!pool) {
    const useSsl = /supabase\.co/i.test(connectionString) || process.env.SUPABASE_PG_SSL === '1';
    pool = new Pool({
      connectionString,
      max: Number(process.env.SUPABASE_PG_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

/**
 * Runs a parameterized query on Supabase Postgres when configured.
 * @param {string} text
 * @param {unknown[]} [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const p = getSupabasePool();
  if (!p) {
    throw new Error(
      'Supabase Postgres is not configured. Set SUPABASE_DATABASE_URL (or DATABASE_URL / postgresql SUPABASE_URL).'
    );
  }
  return p.query(text, params);
}

module.exports = {
  resolveSupabasePostgresUrl,
  getSupabasePool,
  query,
};
