import fs from 'node:fs/promises';
import path from 'node:path';
import * as itemsModel from '../../lib/db/models/items.js';
import * as pagesModel from '../../lib/db/models/pages.js';
import config from '../../config/index.js';

/**
 * Download all page images for an item to local disk.
 * Skips pages whose destination file already exists on disk.
 * @param {string} ark - Full ARK
 * @param {object} [opts]
 * @param {number} [opts.concurrency]
 * @returns {Promise<{downloaded: number, skipped: number, failed: number}>}
 */
export async function downloadItemImages(ark, opts = {}) {
  const { concurrency = config.concurrency.crawl } = opts;

  const item = await itemsModel.getByArk(ark);
  if (!item) throw new Error(`Item not in DB: ${ark}`);

  const pages = await pagesModel.getByItemId(item.id);
  if (!pages.length) {
    console.warn(`  no pages in DB — re-run: node services/harvester/index.js crawl --ark ${ark.split('/').pop()} --force`);
    return { downloaded: 0, skipped: 0, failed: 0 };
  }

  const shortId = ark.split('/').pop();
  const dir = path.join(config.storage.imageDir, shortId);
  await fs.mkdir(dir, { recursive: true });

  let downloaded = 0, skipped = 0, failed = 0;

  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (page) => {
        const dest = path.join(dir, page.filename);
        try {
          // Already on disk — just ensure DB is up to date
          try {
            await fs.access(dest);
            if (!page.image_path) await pagesModel.setImagePath(page.id, dest);
            skipped++;
            return;
          } catch {}

          const res = await fetch(page.image_url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
          await pagesModel.setImagePath(page.id, dest);
          downloaded++;
        } catch (err) {
          console.error(`  failed ${page.filename}: ${err.message}`);
          failed++;
        }
      })
    );
  }

  return { downloaded, skipped, failed };
}

/**
 * Download images for all items (or a specified subset) in the database.
 * @param {object} [opts]
 * @param {string[]} [opts.arks] - Restrict to these ARKs; defaults to all
 * @param {number} [opts.concurrency]
 * @returns {Promise<void>}
 */
export async function downloadAll(opts = {}) {
  const items = opts.arks
    ? (await Promise.all(opts.arks.map((ark) => itemsModel.getByArk(ark)))).filter(Boolean)
    : await itemsModel.getAll({ limit: 10000 });

  for (const item of items) {
    console.log(`Downloading ${item.ark}  "${item.title ?? '(no title)'}"`);
    const result = await downloadItemImages(item.ark, opts);
    console.log(`  downloaded=${result.downloaded} skipped=${result.skipped} failed=${result.failed}`);
  }
}
