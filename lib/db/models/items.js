import { query } from '../index.js';

/**
 * Upsert a catalog item by ARK. Safe to call repeatedly — updates on conflict.
 * @param {string} ark - Full ARK, e.g. "ark:/87287/d7wg68"
 * @param {object} data
 * @param {string} [data.title]
 * @param {string} [data.date]
 * @param {string} [data.creator]
 * @param {string} [data.publisher]
 * @param {string} [data.description]
 * @param {number} [data.pageCount]
 * @param {object} [data.ldpMetadata]
 * @returns {Promise<object>} The upserted row
 */
export async function upsert(ark, data = {}) {
  const { title, date, creator, publisher, description, pageCount, ldpMetadata } = data;
  const result = await query(
    `INSERT INTO items (ark, title, date, creator, publisher, description, page_count, ldp_metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (ark) DO UPDATE SET
       title        = EXCLUDED.title,
       date         = EXCLUDED.date,
       creator      = EXCLUDED.creator,
       publisher    = EXCLUDED.publisher,
       description  = EXCLUDED.description,
       page_count   = EXCLUDED.page_count,
       ldp_metadata = EXCLUDED.ldp_metadata,
       harvested_at = NOW()
     RETURNING *`,
    [ark, title ?? null, date ?? null, creator ?? null, publisher ?? null,
     description ?? null, pageCount ?? 0,
     ldpMetadata ? JSON.stringify(ldpMetadata) : null]
  );
  return result.rows[0];
}

/**
 * Fetch an item by its ARK.
 * @param {string} ark
 * @returns {Promise<object|null>}
 */
export async function getByArk(ark) {
  const result = await query('SELECT * FROM items WHERE ark = $1', [ark]);
  return result.rows[0] ?? null;
}

/**
 * List items with optional pagination.
 * @param {object} [opts]
 * @param {number} [opts.limit=100]
 * @param {number} [opts.offset=0]
 * @returns {Promise<object[]>}
 */
export async function getAll(opts = {}) {
  const { limit = 100, offset = 0 } = opts;
  const result = await query(
    'SELECT * FROM items ORDER BY id LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return result.rows;
}
