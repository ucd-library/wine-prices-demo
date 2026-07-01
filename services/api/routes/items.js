import { Router } from 'express';
import * as itemsModel from '../../../lib/db/models/items.js';
import * as pagesModel from '../../../lib/db/models/pages.js';
import * as wineEntriesModel from '../../../lib/db/models/wine-entries.js';
import { query } from '../../../lib/db/index.js';

const router = Router();

/**
 * GET /api/items
 * Returns all harvested catalog items with page counts.
 */
router.get('/', async (req, res) => {
  try {
    const items = await itemsModel.getAll({ limit: 200 });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/items/:ark
 * Returns item metadata + all pages with wine entry counts.
 * :ark is URL-encoded, e.g. ark:%2F87287%2Fd7wg68 or just the short id d7wg68
 */
router.get('/:ark', async (req, res) => {
  try {
    const ark = decodeURIComponent(req.params.ark);
    const fullArk = ark.startsWith('ark:') ? ark : `ark:/87287/${ark}`;
    const item = await itemsModel.getByArk(fullArk);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const pages = await pagesModel.getByItemId(item.id);

    // Attach entry counts per page
    const result = await query(
      'SELECT page_id, COUNT(*) AS entry_count FROM wine_entries WHERE item_id = $1 GROUP BY page_id',
      [item.id]
    );
    const countMap = Object.fromEntries(result.rows.map((r) => [r.page_id, parseInt(r.entry_count, 10)]));

    res.json({
      item,
      pages: pages.map((p) => ({ ...p, entryCount: countMap[p.id] ?? 0 })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/items/:ark/pages/:num
 * Returns a single page with all extracted wine entries.
 */
router.get('/:ark/pages/:num', async (req, res) => {
  try {
    const ark = decodeURIComponent(req.params.ark);
    const fullArk = ark.startsWith('ark:') ? ark : `ark:/87287/${ark}`;
    const pageNum = parseInt(req.params.num, 10);

    const item = await itemsModel.getByArk(fullArk);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const pages = await pagesModel.getByItemId(item.id);
    const page = pages.find((p) => p.page_number === pageNum);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const wineEntries = await wineEntriesModel.getByPageId(page.id);
    res.json({ page, wineEntries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
