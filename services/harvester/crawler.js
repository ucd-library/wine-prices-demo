import { getItem, getItemImages, getItemTextFiles } from '../../lib/ldp-client.js';
import * as itemsModel from '../../lib/db/models/items.js';
import * as pagesModel from '../../lib/db/models/pages.js';

/**
 * Harvest a single item: fetch LDP metadata and page image list, write to DB.
 * Idempotent — skips already-harvested items unless force is set.
 * @param {string} ark - Full ARK, e.g. "ark:/87287/d7wg68"
 * @param {object} [opts]
 * @param {boolean} [opts.force=false] - Re-harvest even if item exists in DB
 * @returns {Promise<{item: object, pagesInserted: number, skipped: boolean}>}
 */
export async function harvestItem(ark, opts = {}) {
  const { force = false } = opts;

  if (!force) {
    const existing = await itemsModel.getByArk(ark);
    if (existing) return { item: existing, pagesInserted: 0, skipped: true };
  }

  const [metadata, images, textFiles] = await Promise.all([
    getItem(ark),
    getItemImages(ark),
    getItemTextFiles(ark),
  ]);

  // Build a suffix → textUrl map for pairing text with images by page number
  const textMap = {};
  for (const tf of textFiles) {
    const match = tf.filename.match(/-(\d+)\./);
    if (match) textMap[match[1]] = tf.textUrl;
  }

  const item = await itemsModel.upsert(ark, {
    title:       metadata.title,
    date:        metadata.date,
    creator:     metadata.creator,
    publisher:   metadata.publisher,
    description: metadata.description,
    pageCount:   images.length,
    ldpMetadata: metadata.raw,
  });

  const pages = images.map((img) => {
    const match = img.filename.match(/-(\d+)\.jpg$/);
    const suffix = match ? match[1] : null;
    return {
      filename:   img.filename,
      pageNumber: img.pageNumber,
      imageUrl:   img.imageUrl,
      textUrl:    suffix ? (textMap[suffix] ?? null) : null,
    };
  });

  const pagesInserted = await pagesModel.insertBatch(item.id, pages);
  return { item, pagesInserted, skipped: false };
}
