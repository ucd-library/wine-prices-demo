import { query, getPool } from '../index.js';

/**
 * Insert multiple page rows for an item. Skips duplicates (idempotent).
 * @param {number} itemId
 * @param {Array<{filename: string, pageNumber: number, imageUrl: string, textUrl?: string}>} pages
 * @returns {Promise<number>} Number of rows newly inserted
 */
export async function insertBatch(itemId, pages) {
  if (!pages.length) return 0;
  const client = await getPool().connect();
  let inserted = 0;
  try {
    for (const page of pages) {
      const result = await client.query(
        `INSERT INTO pages (item_id, filename, page_number, image_url, text_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (item_id, filename) DO NOTHING`,
        [itemId, page.filename, page.pageNumber ?? null, page.imageUrl, page.textUrl ?? null]
      );
      inserted += result.rowCount;
    }
  } finally {
    client.release();
  }
  return inserted;
}

/**
 * Fetch a single page by its primary key.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export async function getById(id) {
  const result = await query('SELECT * FROM pages WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

/**
 * Fetch pages not yet processed by the extractor.
 * @param {object} [opts]
 * @param {number} [opts.limit] - Max rows to return; omit for no limit
 * @param {number} [opts.itemId] - Restrict to a specific item
 * @returns {Promise<object[]>}
 */
export async function getUnprocessed(opts = {}) {
  const { limit, itemId } = opts;
  const params = [];
  let sql = 'SELECT * FROM pages WHERE processed = FALSE';
  if (itemId != null) {
    params.push(itemId);
    sql += ` AND item_id = $${params.length}`;
  }
  sql += ' ORDER BY id';
  if (limit != null) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }
  const result = await query(sql, params);
  return result.rows;
}

/**
 * Mark a page as processed and store the raw LLM response object.
 * @param {number} id
 * @param {object} llmResponse
 * @returns {Promise<void>}
 */
export async function markProcessed(id, llmResponse) {
  await query(
    `UPDATE pages SET processed = TRUE, processed_at = NOW(), llm_raw_response = $2 WHERE id = $1`,
    [id, JSON.stringify(llmResponse)]
  );
}

/**
 * Reset processed status so the extractor will requeue these pages.
 * @param {object} [opts]
 * @param {number} [opts.itemId] - Reset all pages for this item
 * @param {number} [opts.pageId] - Reset a single page
 * @returns {Promise<void>}
 */
export async function resetProcessed(opts = {}) {
  const { itemId, pageId } = opts;
  if (pageId != null) {
    await query('UPDATE pages SET processed = FALSE, processed_at = NULL WHERE id = $1', [pageId]);
  } else if (itemId != null) {
    await query('UPDATE pages SET processed = FALSE, processed_at = NULL WHERE item_id = $1', [itemId]);
  } else {
    await query('UPDATE pages SET processed = FALSE, processed_at = NULL');
  }
}

/**
 * Update the stored image path after download. The path is a subpath
 * relative to the image store root (IMAGE_DIR or GCS bucket),
 * e.g. "<shortArk>/<filename>".
 * @param {number} id
 * @param {string} imagePath
 * @returns {Promise<void>}
 */
export async function setImagePath(id, imagePath) {
  await query('UPDATE pages SET image_path = $2 WHERE id = $1', [id, imagePath]);
}

/**
 * Fetch all pages for a given item, ordered by page number.
 * @param {number} itemId
 * @returns {Promise<object[]>}
 */
export async function getByItemId(itemId) {
  const result = await query(
    'SELECT * FROM pages WHERE item_id = $1 ORDER BY page_number',
    [itemId]
  );
  return result.rows;
}
