import { query, getPool } from '../index.js';

/**
 * Replace all wine entries for a page with a new set extracted by the LLM.
 * Runs inside a transaction — old entries deleted, new ones inserted atomically.
 * @param {number} pageId
 * @param {number} itemId
 * @param {Array<object>} entries - Structured wine data from LLM
 * @returns {Promise<number>} Number of rows inserted
 */
export async function replaceBatch(pageId, itemId, entries) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM wine_entries WHERE page_id = $1', [pageId]);
    let inserted = 0;
    for (const e of entries) {
      await client.query(
        `INSERT INTO wine_entries (
          page_id, item_id, wine_name, producer, vineyard, vintage_year,
          color, varietal, region, appellation, country,
          price, case_price, bottle_size, rating, importer,
          description, currency, confidence
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          pageId, itemId,
          e.wine_name    ?? null,
          e.producer     ?? null,
          e.vineyard     ?? null,
          e.vintage_year ?? null,
          e.color        ?? null,
          e.varietal     ?? null,
          e.region       ?? null,
          e.appellation  ?? null,
          e.country      ?? null,
          e.price        ?? null,
          e.case_price   ?? null,
          e.bottle_size  ?? null,
          e.rating       ?? null,
          e.importer     ?? null,
          e.description  ?? null,
          e.currency     ?? 'USD',
          e.confidence   ?? null,
        ]
      );
      inserted++;
    }
    await client.query('COMMIT');
    return inserted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Fetch all wine entries for a page.
 * @param {number} pageId
 * @returns {Promise<object[]>}
 */
export async function getByPageId(pageId) {
  const result = await query(
    'SELECT * FROM wine_entries WHERE page_id = $1 ORDER BY id',
    [pageId]
  );
  return result.rows;
}

/**
 * Fetch all wine entries for an item.
 * @param {number} itemId
 * @returns {Promise<object[]>}
 */
export async function getByItemId(itemId) {
  const result = await query(
    'SELECT * FROM wine_entries WHERE item_id = $1 ORDER BY page_id, id',
    [itemId]
  );
  return result.rows;
}
