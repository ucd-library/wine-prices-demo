import { Router } from 'express';
import { query } from '../../../lib/db/index.js';
import { generateSql, buildPaginatedSql } from '../sql-gen.js';

const router = Router();

/**
 * Group flat SQL result rows into a nested item → pages → entries structure.
 * @param {object[]} rows
 * @returns {object[]}
 */
function groupRows(rows) {
  const itemMap = new Map();

  for (const row of rows) {
    if (!itemMap.has(row.item_id)) {
      itemMap.set(row.item_id, {
        id: row.item_id,
        ark: row.ark,
        title: row.title,
        date: row.date,
        creator: row.creator,
        pages: new Map(),
      });
    }
    const item = itemMap.get(row.item_id);

    if (row.page_id != null && !item.pages.has(row.page_id)) {
      item.pages.set(row.page_id, {
        id: row.page_id,
        filename: row.filename,
        pageNumber: row.page_number,
        imageUrl: row.image_url,
        wineEntries: [],
      });
    }

    if (row.page_id != null && row.entry_id != null) {
      item.pages.get(row.page_id).wineEntries.push({
        id:          row.entry_id,
        wineName:    row.wine_name,
        producer:    row.producer,
        vineyard:    row.vineyard,
        vintageYear: row.vintage_year,
        color:       row.color,
        varietal:    row.varietal,
        region:      row.region,
        appellation: row.appellation,
        country:     row.country,
        price:       row.price != null ? parseFloat(row.price) : null,
        casePrice:   row.case_price != null ? parseFloat(row.case_price) : null,
        bottleSize:  row.bottle_size,
        rating:      row.rating,
        description: row.description,
        confidence:  row.confidence,
      });
    }
  }

  return Array.from(itemMap.values()).map((item) => ({
    ...item,
    pages: Array.from(item.pages.values()),
  }));
}

const PAGE_SIZE = 20;

/**
 * POST /api/search
 *
 * New search:
 *   Body: { query?: string, filters?: object, model?: string, page?: number }
 *   At least one of query or a non-empty filters object is required.
 *
 * Page turn (skips LLM):
 *   Body: { conditions: string, conditionParams: Array, page: number }
 */
router.post('/', async (req, res) => {
  const { query: nlQuery, filters = {}, model, page = 1,
          conditions: prebuiltConditions, conditionParams: prebuiltParams } = req.body ?? {};

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const paginateOpts = { page: pageNum, pageSize: PAGE_SIZE };

  let built;

  if (prebuiltConditions != null && prebuiltParams != null) {
    // Fast page turn — client supplies cached conditions, skip the LLM
    if (!Array.isArray(prebuiltParams)) {
      return res.status(400).json({ error: 'conditionParams must be an array' });
    }
    built = buildPaginatedSql(prebuiltConditions, prebuiltParams, paginateOpts);
  } else {
    const hasQuery = nlQuery?.trim();
    const hasFilters = filters && (
      filters.colors?.length || filters.countries?.length ||
      filters.regions?.length || filters.varietals?.length ||
      filters.vintageYearMin != null || filters.vintageYearMax != null ||
      filters.priceMin != null || filters.priceMax != null
    );

    if (!hasQuery && !hasFilters) {
      return res.status(400).json({ error: 'Provide a search query or at least one filter' });
    }

    try {
      built = await generateSql(nlQuery ?? '', { model, filters, ...paginateOpts });
    } catch (err) {
      console.error('SQL generation error:', err.message);
      return res.status(502).json({ error: 'Could not interpret search query, please rephrase' });
    }
  }

  const { sql, params, countSql, conditions, conditionParams } = built;

  try {
    const [dataResult, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, conditionParams),
    ]);

    const results   = groupRows(dataResult.rows);
    const total     = parseInt(countResult.rows[0]?.total ?? 0, 10);
    const totalPages = Math.ceil(total / PAGE_SIZE);

    res.json({ results, total, page: pageNum, pageSize: PAGE_SIZE, totalPages,
               conditions, conditionParams, sql, params });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
