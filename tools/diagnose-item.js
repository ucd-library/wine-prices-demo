/**
 * Diagnostic: show DB state for a given ARK and test the full crawl+download pipeline.
 * Usage: node tools/diagnose-item.js [shortArk]
 */
import { query } from '../lib/db/index.js';
import * as itemsModel from '../lib/db/models/items.js';
import * as pagesModel from '../lib/db/models/pages.js';
import { getItemImages } from '../lib/ldp-client.js';

const shortArk = process.argv[2] ?? 'd75079';
const ark = shortArk.startsWith('ark:') ? shortArk : `ark:/87287/${shortArk}`;

console.log(`\n=== Diagnostics for ${ark} ===\n`);

// 1. items table
const item = await itemsModel.getByArk(ark);
if (!item) {
  console.log('items: NOT IN DB');
} else {
  console.log(`items:  id=${item.id}  ark=${item.ark}  page_count=${item.page_count}  title=${item.title}`);
}

// 2. pages table (direct SQL so we're not relying on model)
const rawPages = await query('SELECT id, item_id, filename, page_number, image_url FROM pages WHERE item_id = $1 ORDER BY page_number LIMIT 5', [item?.id ?? -1]);
console.log(`pages table (direct): ${rawPages.rowCount} row(s) for item_id=${item?.id}`);
for (const r of rawPages.rows) {
  console.log(`  id=${r.id}  page=${r.page_number}  file=${r.filename}`);
}

// 3. What does pagesModel.getByItemId return?
if (item) {
  const modelPages = await pagesModel.getByItemId(item.id);
  console.log(`getByItemId(${item.id}): returned ${modelPages.length} row(s)`);
}

// 4. What does LDP return right now?
console.log('\nFetching live LDP images...');
try {
  const images = await getItemImages(ark);
  console.log(`getItemImages: ${images.length} image(s)`);
  if (images.length > 0) {
    console.log('  sample:', images.slice(0, 3).map(i => i.filename).join(', '));
  }
} catch (err) {
  console.error('getItemImages error:', err.message);
}

// 5. Any other items rows with same ark prefix (duplicates)?
const dupCheck = await query('SELECT id, ark, page_count FROM items WHERE ark LIKE $1', [`%${shortArk}%`]);
console.log(`\nAll items matching "${shortArk}":`);
for (const r of dupCheck.rows) {
  const pc = await query('SELECT COUNT(*) FROM pages WHERE item_id=$1', [r.id]);
  console.log(`  id=${r.id}  ark=${r.ark}  page_count=${r.page_count}  actual_pages=${pc.rows[0].count}`);
}

process.exit(0);
