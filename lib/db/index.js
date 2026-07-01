import pg from 'pg';
import config from '../../config/index.js';

const { Pool } = pg;

/** @type {pg.Pool|null} */
let pool = null;

/**
 * Returns the shared PostgreSQL connection pool, creating it on first call.
 * @returns {pg.Pool}
 */
export function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: config.db.url });
    pool.on('error', (err) => console.error('pg pool error', err));
  }
  return pool;
}

/**
 * Execute a parameterized query against the shared pool.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Promise<pg.QueryResult>}
 */
export function query(sql, params) {
  return getPool().query(sql, params);
}

/**
 * Close the pool. Call before process exit in long-running services.
 * @returns {Promise<void>}
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
