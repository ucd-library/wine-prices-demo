/**
 * Smoke test: run extraction on all pages for one item and inspect results.
 * Run: DATABASE_URL=... SAMWISE_BASE_URL=... node tests/test-extract.js [ark]
 *
 * The ARK must already have been harvested (run test-harvest.js first).
 */

import { runExtractor } from '../services/extractor/processor.js';
import * as itemsModel from '../lib/db/models/items.js';
import * as wineEntriesModel from '../lib/db/models/wine-entries.js';
import * as pagesModel from '../lib/db/models/pages.js';
import { closePool } from '../lib/db/index.js';

const ark = process.argv[2] ?? 'ark:/87287/d7wg68';

async function run() {
  const item = await itemsModel.getByArk(ark);
  if (!item) { console.error(`Item not in DB: ${ark}\nRun test-harvest.js first.`); process.exit(1); }

  console.log(`Extracting: ${item.title} (id=${item.id})`);

  // Reset processed so we re-run cleanly in test
  await pagesModel.resetProcessed({ itemId: item.id });

  const result = await runExtractor({ itemId: item.id, concurrency: 1 });
  console.log(`\nExtraction complete: pages=${result.totalPages} entries=${result.totalEntries}`);

  const entries = await wineEntriesModel.getByItemId(item.id);
  console.log(`\nSample extracted entries (first 10):`);
  for (const e of entries.slice(0, 10)) {
    console.log(
      `  ${e.wine_name ?? '(no name)'}  |  ${e.vintage_year ?? '-'}  |  ${e.color ?? '-'}  |  ${e.region ?? '-'}  |  $${e.price ?? '-'}`
    );
  }

  await closePool();
}

run().catch((err) => { console.error(err); process.exit(1); });
