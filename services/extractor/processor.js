import sharp from 'sharp';
import * as pagesModel from '../../lib/db/models/pages.js';
import * as wineEntriesModel from '../../lib/db/models/wine-entries.js';
import { sendVision } from '../../lib/llm-client.js';
import { buildExtractionPrompt, parseExtractionResponse } from './prompt.js';
import config from '../../config/index.js';

// Resize page images to this maximum dimension before sending to the LLM.
// 1280px keeps the text legible for catalog extractions while staying under ~1MB base64.
const MAX_DIMENSION = 1280;

/**
 * Manages a dynamic-height progress area at the bottom of the terminal.
 * Each active page owns a slot. Slot updates redraw the block in place;
 * completions print the final line above the block and shrink it by one.
 * Falls back to plain line-by-line output when stdout is not a TTY.
 */
class ProgressArea {
  constructor() {
    this.slots = new Map(); // pageId → line text
    this.areaLines = 0;
    this.tty = process.stdout.isTTY;
  }

  /** Erase the current area and leave cursor at the top of where it was. */
  _clearArea() {
    if (!this.areaLines) return;
    process.stdout.write(`\x1b[${this.areaLines}A`);
    for (let i = 0; i < this.areaLines; i++) {
      process.stdout.write('\r\x1b[K\n');
    }
    process.stdout.write(`\x1b[${this.areaLines}A`);
  }

  /** Print all active slots and leave cursor below the last line. */
  _drawArea() {
    for (const line of this.slots.values()) {
      process.stdout.write(`\r\x1b[K${line}\n`);
    }
    this.areaLines = this.slots.size;
  }

  /**
   * Update a page slot and redraw the block.
   * @param {number} id - page.id used as slot key
   * @param {string} text
   */
  update(id, text) {
    this.slots.set(id, text);
    if (!this.tty) return; // non-TTY: skip per-token updates
    this._clearArea();
    this._drawArea();
  }

  /**
   * Remove a slot and print its final line above the remaining block.
   * @param {number} id
   * @param {string} line - Completion or error message
   */
  complete(id, line) {
    this.slots.delete(id);
    if (this.tty) {
      this._clearArea();
      process.stdout.write(`${line}\n`);
      this._drawArea();
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}

/**
 * Resize an image (from disk path or Buffer) and return a base64-encoded JPEG.
 * @param {string|Buffer} source - File path or image buffer
 * @returns {Promise<string>} Base64-encoded JPEG
 */
async function resizeAndEncode(source) {
  const buf = await sharp(source)
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buf.toString('base64');
}

/**
 * Get the base64 image for a page — from local disk if available, otherwise fetched from LDP.
 * @param {object} page - Page row from DB
 * @returns {Promise<string>} Base64-encoded JPEG
 */
async function getImageBase64(page) {
  if (page.image_path) return resizeAndEncode(page.image_path);
  const res = await fetch(page.image_url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${page.image_url}`);
  return resizeAndEncode(Buffer.from(await res.arrayBuffer()));
}

/**
 * Fetch OCR text for a page if a text_url is set. Returns null on failure.
 * @param {object} page - Page row from DB
 * @returns {Promise<string|null>}
 */
async function fetchOcrText(page) {
  if (!page.text_url) return null;
  try {
    const res = await fetch(page.text_url);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

/**
 * Process a single page: encode image, call LLM, store extracted wine entries.
 * The onChunk callback receives the running token count and is used by the
 * caller to display streaming progress.
 * @param {object} page - Page row from DB
 * @param {object} [opts]
 * @param {string} [opts.model] - Override LLM model for this call
 * @param {function} [opts.onChunk] - (tokenCount: number) => void
 * @returns {Promise<{entriesFound: number}>}
 */
export async function processPage(page, opts = {}) {
  const { model, onChunk } = opts;

  const [base64Image, ocrText] = await Promise.all([
    getImageBase64(page),
    fetchOcrText(page),
  ]);

  const prompt = buildExtractionPrompt({ ocrText });
  const responseText = await sendVision(base64Image, 'image/jpeg', prompt, {
    maxTokens: 16384,
    model,
    onChunk,
  });

  const entries = parseExtractionResponse(responseText);
  await wineEntriesModel.replaceBatch(page.id, page.item_id, entries);
  await pagesModel.markProcessed(page.id, { response: responseText, entriesFound: entries.length });

  return { entriesFound: entries.length };
}

/**
 * Run the extraction loop — process all unprocessed pages in concurrent batches.
 * Displays a live multi-slot progress area in the terminal.
 * @param {object} [opts]
 * @param {number} [opts.itemId] - Restrict to pages for this item DB id
 * @param {string} [opts.model] - Override LLM model
 * @param {number} [opts.concurrency]
 * @returns {Promise<{totalPages: number, totalEntries: number}>}
 */
export async function runExtractor(opts = {}) {
  const { itemId, model, concurrency = config.concurrency.extract } = opts;
  const area = new ProgressArea();
  let totalPages = 0;
  let totalEntries = 0;

  const pages = await pagesModel.getUnprocessed({ itemId });
  const queue = [...pages];

  /**
   * Worker: continuously pulls the next page from the shared queue until empty.
   * As soon as one page finishes, this worker immediately starts the next —
   * no waiting for sibling workers to catch up.
   */
  async function worker() {
    while (queue.length) {
      const page = queue.shift();
      const label = `[page ${page.id}] ${page.filename}`;

      if (!process.stdout.isTTY) {
        process.stdout.write(`${label}  processing...\n`);
      }

      try {
        const result = await processPage(page, {
          model,
          onChunk: (n) => area.update(page.id, `${label}  ${n} tokens`),
        });
        totalPages++;
        totalEntries += result.entriesFound;
        area.complete(page.id, `${label}  entries=${result.entriesFound}`);
      } catch (err) {
        totalPages++;
        area.complete(page.id, `${label}  FAILED: ${err.message}`);
      }
    }
  }

  console.log(`Starting extraction of ${pages.length} pages with concurrency=${concurrency}...`);

  await Promise.all(Array.from({ length: concurrency }, worker));

  return { totalPages, totalEntries };
}
