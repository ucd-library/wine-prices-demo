/**
 * Smoke test: harvest a handful of real items and verify DB rows + image lists.
 * Run: DATABASE_URL=... SAMWISE_BASE_URL=... node tests/test-harvest.js
 */

import { fetchArks } from '../services/harvester/sitemap.js';
import { harvestItem } from '../services/harvester/crawler.js';
import { downloadItemImages } from '../services/harvester/downloader.js';
import * as itemsModel from '../lib/db/models/items.js';
import * as pagesModel from '../lib/db/models/pages.js';
import { closePool } from '../lib/db/index.js';

const TEST_ARKS = [
  'ark:/87287/d7wg68',
  'ark:/87287/d74p9n',
  'ark:/87287/d73s9c',
];

async function run() {
  console.log('--- Sitemap ---');
  const allArks = await fetchArks();
  console.log(`Total items in collection: ${allArks.length}`);
  console.log('First 5:', allArks.slice(0, 5));

  for (const ark of TEST_ARKS) {
    console.log(`\n--- Harvesting ${ark} ---`);
    const result = await harvestItem(ark, { force: true });
    console.log(`title: ${result.item.title}`);
    console.log(`date:  ${result.item.date}`);
    console.log(`pages: ${result.pagesInserted} inserted`);

    const pages = await pagesModel.getByItemId(result.item.id);
    console.log(`page rows in DB: ${pages.length}`);
    if (pages.length > 0) {
      console.log(`first image URL: ${pages[0].image_url}`);
      console.log(`first text URL:  ${pages[0].text_url ?? '(none)'}`);
    }
  }

  console.log('\n--- Downloading images for first test ARK ---');
  const downloadResult = await downloadItemImages(TEST_ARKS[0], { concurrency: 2 });
  console.log(downloadResult);

  await closePool();
  console.log('\nDone.');
}

run().catch((err) => { console.error(err); process.exit(1); });
