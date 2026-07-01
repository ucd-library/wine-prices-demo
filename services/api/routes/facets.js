import { Router } from 'express';
import { query } from '../../../lib/db/index.js';

const router = Router();

/**
 * GET /api/facets
 * Returns facet counts for all major filter dimensions plus year/price ranges.
 */
router.get('/', async (req, res) => {
  try {
    const [colors, countries, regions, varietals, yearRange, priceRange, catalogCount, entryCount] = await Promise.all([
      query(`SELECT color AS value, COUNT(*)::int AS count
             FROM wine_entries WHERE color IS NOT NULL
             GROUP BY color ORDER BY count DESC`),
      query(`SELECT country AS value, COUNT(*)::int AS count
             FROM wine_entries WHERE country IS NOT NULL
             GROUP BY country ORDER BY count DESC LIMIT 20`),
      query(`SELECT region AS value, COUNT(*)::int AS count
             FROM wine_entries WHERE region IS NOT NULL
             GROUP BY region ORDER BY count DESC LIMIT 25`),
      query(`SELECT varietal AS value, COUNT(*)::int AS count
             FROM wine_entries WHERE varietal IS NOT NULL
             GROUP BY varietal ORDER BY count DESC LIMIT 25`),
      query(`SELECT MIN(vintage_year) AS min, MAX(vintage_year) AS max
             FROM wine_entries WHERE vintage_year IS NOT NULL`),
      query(`SELECT MIN(price)::numeric AS min, MAX(price)::numeric AS max
             FROM wine_entries WHERE price IS NOT NULL`),
      query(`SELECT COUNT(*)::int AS count FROM items`),
      query(`SELECT COUNT(*)::int AS count FROM wine_entries`),
    ]);

    res.json({
      colors:    colors.rows,
      countries: countries.rows,
      regions:   regions.rows,
      varietals: varietals.rows,
      vintageYear: {
        min: yearRange.rows[0]?.min ?? null,
        max: yearRange.rows[0]?.max ?? null,
      },
      price: {
        min: priceRange.rows[0]?.min != null ? parseFloat(priceRange.rows[0].min) : null,
        max: priceRange.rows[0]?.max != null ? parseFloat(priceRange.rows[0].max) : null,
      },
      stats: {
        catalogs:    catalogCount.rows[0]?.count ?? 0,
        wineEntries: entryCount.rows[0]?.count ?? 0,
      },
    });
  } catch (err) {
    console.error('Facets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
