import { XMLParser } from 'fast-xml-parser';
import config from '../../config/index.js';

/**
 * Fetch and parse the collection sitemap XML, returning all item ARKs.
 * @param {string} [collectionArk] - Override the default collection ARK from config
 * @returns {Promise<string[]>} Full ARKs, e.g. ["ark:/87287/d7wg68", ...]
 */
export async function fetchArks(collectionArk) {
  const ark = collectionArk ?? config.ldp.collectionArk;
  const url = `${config.ldp.host}/sitemap-${ark}.xml`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status} ${url}`);
  const xml = await res.text();

  const parser = new XMLParser();
  const doc = parser.parse(xml);

  const urls = doc?.urlset?.url ?? [];
  const list = Array.isArray(urls) ? urls : [urls];

  return list
    .map((entry) => {
      // loc: https://digital.ucdavis.edu/item/ark:/87287/d7wg68
      const loc = typeof entry?.loc === 'string' ? entry.loc : String(entry?.loc ?? '');
      const match = loc.match(/ark:\/87287\/(\w+)$/);
      return match ? `ark:/87287/${match[1]}` : null;
    })
    .filter(Boolean);
}
