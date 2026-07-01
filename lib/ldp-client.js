import config from '../config/index.js';

const BASE = config.ldp.host;

/**
 * Fetch a URL from the LDP with JSON-LD content negotiation.
 * Returns a normalised plain object regardless of whether the server
 * returned compacted JSON-LD (object) or expanded JSON-LD (array).
 * @param {string} url
 * @returns {Promise<object>}
 */
async function fetchJsonLd(url) {
  const res = await fetch(url, { headers: { Accept: 'application/ld+json' } });
  if (!res.ok) throw new Error(`LDP ${res.status}: ${url}`);
  const body = await res.json();
  // Expanded JSON-LD is a top-level array; take the first graph node.
  return Array.isArray(body) ? (body[0] ?? {}) : body;
}

/**
 * Look up a schema.org field by either expanded URI or prefixed form.
 * The LDP returns expanded JSON-LD (full URIs) for most items.
 * @param {object} obj
 * @param {string} name - Local name, e.g. "hasPart"
 * @returns {*}
 */
function schema(obj, name) {
  return obj[`http://schema.org/${name}`] ?? obj[`schema:${name}`];
}

/**
 * Extract a scalar string from a JSON-LD field value.
 * Handles plain strings, { "@value": "..." }, and arrays of either.
 * @param {*} field
 * @returns {string|null}
 */
function ldpValue(field) {
  if (field == null) return null;
  const val = Array.isArray(field) ? field[0] : field;
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') return val['@value'] ?? val['@id'] ?? null;
  return null;
}

/**
 * Fetch item metadata from the LDP.
 * @param {string} ark - Short id ("d7wg68") or full ARK ("ark:/87287/d7wg68")
 * @returns {Promise<{ark: string, title: string, date: string, creator: string, publisher: string, description: string, raw: object}>}
 */
export async function getItem(ark) {
  const shortId = ark.includes('/') ? ark.split('/').pop() : ark;
  const url = `${BASE}/fcrepo/rest/item/ark:/87287/${shortId}`;
  const data = await fetchJsonLd(url);
  return {
    ark:         `ark:/87287/${shortId}`,
    title:       ldpValue(schema(data, 'name')),
    date:        ldpValue(schema(data, 'datePublished')),
    creator:     ldpValue(schema(data, 'creator')),
    publisher:   ldpValue(schema(data, 'publisher')),
    description: ldpValue(schema(data, 'description')),
    raw: data,
  };
}

/**
 * Fetch the list of page images for an item from its /media/images container.
 * @param {string} ark - Short id or full ARK
 * @returns {Promise<Array<{filename: string, imageUrl: string, pageNumber: number}>>}
 */
export async function getItemImages(ark) {
  const shortId = ark.includes('/') ? ark.split('/').pop() : ark;
  const url = `${BASE}/fcrepo/rest/item/ark:/87287/${shortId}/media/images`;
  const data = await fetchJsonLd(url);

  const raw = schema(data, 'hasPart') ?? [];
  const parts = Array.isArray(raw) ? raw : [raw];

  return parts
    .map((part) => {
      const imageUrl = typeof part === 'string' ? part : part['@id'];
      if (!imageUrl || !imageUrl.endsWith('.jpg')) return null;
      const filename = imageUrl.split('/').pop();
      const match = filename.match(/-(\d+)\.jpg$/);
      return {
        filename,
        imageUrl,
        pageNumber: match ? parseInt(match[1], 10) : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
}

/**
 * Fetch OCR text file URLs from the /media/text container.
 * Returns an empty array if the container is absent or empty.
 * @param {string} ark - Short id or full ARK
 * @returns {Promise<Array<{filename: string, textUrl: string}>>}
 */
export async function getItemTextFiles(ark) {
  const shortId = ark.includes('/') ? ark.split('/').pop() : ark;
  const url = `${BASE}/fcrepo/rest/item/ark:/87287/${shortId}/media/text`;
  try {
    const data = await fetchJsonLd(url);
    const raw = schema(data, 'hasPart') ?? [];
    const parts = Array.isArray(raw) ? raw : [raw];
    return parts
      .map((part) => {
        const textUrl = typeof part === 'string' ? part : part['@id'];
        if (!textUrl) return null;
        return { filename: textUrl.split('/').pop(), textUrl };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
