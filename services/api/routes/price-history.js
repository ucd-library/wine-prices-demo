import { Router } from 'express';
import * as wineEntriesModel from '../../../lib/db/models/wine-entries.js';

const router = Router();

/**
 * GET /api/price-history?wineName=...&producer=...
 * Returns all price observations for a wine (matched by name + producer)
 * across catalogs, for the price-over-time graph.
 */
router.get('/', async (req, res) => {
  const { wineName, producer } = req.query;
  if (!wineName?.trim()) {
    return res.status(400).json({ error: 'wineName is required' });
  }

  try {
    const rows = await wineEntriesModel.getPriceHistory({
      wineName,
      producer: producer?.trim() ? producer : null,
    });

    const observations = rows.map((r) => ({
      id:          r.id,
      price:       parseFloat(r.price),
      casePrice:   r.case_price != null ? parseFloat(r.case_price) : null,
      bottleSize:  r.bottle_size,
      vintageYear: r.vintage_year,
      confidence:  r.confidence,
      currency:    r.currency,
      catalogYear: r.catalog_year,
      catalogDate: r.catalog_date,
      catalogTitle: r.title,
      ark:         r.ark,
      pageNumber:  r.page_number,
      filename:    r.filename,
    }));

    res.json({ wineName, producer: producer ?? null, observations });
  } catch (err) {
    console.error('Price history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
