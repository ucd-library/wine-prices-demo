import { sendText } from '../../lib/llm-client.js';
import config from '../../config/index.js';

const SELECT = `
  i.id        AS item_id,
  i.ark,
  i.title,
  i.date,
  i.creator,
  p.id        AS page_id,
  p.filename,
  p.page_number,
  p.image_url,
  we.id       AS entry_id,
  we.wine_name,
  we.producer,
  we.vineyard,
  we.vintage_year,
  we.color,
  we.varietal,
  we.region,
  we.appellation,
  we.country,
  we.price,
  we.case_price,
  we.bottle_size,
  we.rating,
  we.description,
  we.confidence
`.trim();

const FROM = `
  FROM items i
  JOIN pages p         ON p.item_id  = i.id
  JOIN wine_entries we ON we.page_id = p.id
`.trim();

const SCHEMA_CONTEXT = `
wine_entries columns (all nullable):
  wine_name TEXT, producer TEXT, vineyard TEXT,
  vintage_year INTEGER,
  color TEXT  (values: red, white, rosé, sparkling, dessert, fortified),
  varietal TEXT  (grape variety, e.g. "Cabernet Sauvignon"),
  region TEXT, appellation TEXT, country TEXT,
  price NUMERIC, case_price NUMERIC,
  bottle_size TEXT, rating INTEGER,
  importer TEXT, description TEXT,
  confidence TEXT (high / medium / low)

items columns: title TEXT, date TEXT, creator TEXT, publisher TEXT

All three tables are joined: items i → pages p → wine_entries we
Use table alias prefixes: we.<col>, i.<col>
`.trim();

/**
 * Build the LLM prompt for WHERE-clause generation.
 * @param {string} nlQuery
 * @returns {string}
 */
function buildPrompt(nlQuery) {
  return `You are a PostgreSQL WHERE-clause generator for a wine catalog search database.

${SCHEMA_CONTEXT}

User query: "${nlQuery}"

Return ONLY a JSON object — no markdown, no explanation:
{
  "conditions": "<SQL WHERE body — $1, $2 … placeholders only, NO literal values>",
  "params": [<values in placeholder order>]
}

Rules:
- EVERY filter value must be a $n placeholder — never embed literal strings or numbers in conditions
- Use ILIKE $n with % wildcards for text fields (e.g. we.wine_name ILIKE $1, param "%Cabernet%")
- Use numeric comparisons for price and vintage_year (e.g. we.price < $2, param 15)
- vintage_year params must be integers; price params must be numbers
- If the query is too vague to filter, use "conditions": "TRUE", "params": []
- Do NOT include SELECT, FROM, ORDER BY, or LIMIT — only the WHERE body
- Do NOT use subqueries or CTEs
- For sensory or descriptive terms (color, taste, aroma, appearance, style): extract the
  meaningful content words, drop filler words (notes, hints, aromas, flavors, of, with, and),
  and emit one we.description ILIKE $n per key term with % wildcards. Examples:
    "strawberry notes"       → we.description ILIKE $1,              params: ["%strawberry%"]
    "inky purple"            → we.description ILIKE $1,              params: ["%inky purple%"]
    "dark cherry and tobacco"→ we.description ILIKE $1 AND we.description ILIKE $2,
                               params: ["%cherry%", "%tobacco%"]
- For geographic terms (states, countries, broader wine regions): use we.region ILIKE $n
  or we.country ILIKE $n with % wildcards — do not enumerate specific region names.

Example — "California Cabernet under $15 from the 1980s":
{
  "conditions": "we.region ILIKE $1 AND we.varietal ILIKE $2 AND we.price < $3 AND we.vintage_year >= $4 AND we.vintage_year <= $5",
  "params": ["%California%", "%Cabernet%", 15, 1980, 1989]
}`;
}

const FORBIDDEN = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|exec|execute)\b/i;

/**
 * Validate that the LLM-generated conditions string is safe to interpolate.
 * @param {string} conditions
 * @returns {string}
 */
function validateConditions(conditions) {
  if (!conditions || typeof conditions !== 'string') throw new Error('LLM returned empty conditions');
  if (conditions.includes(';')) throw new Error('Conditions contain semicolon');
  if (FORBIDDEN.test(conditions)) throw new Error('Conditions contain forbidden keyword');
  return conditions;
}

/**
 * Parse and validate the LLM response JSON.
 * @param {string} text
 * @returns {{conditions: string, params: Array}}
 */
function parseResponse(text) {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
  validateConditions(parsed.conditions);
  if (!Array.isArray(parsed.params)) throw new Error('LLM params is not an array');
  // Count highest $n placeholder referenced in conditions
  const placeholders = [...parsed.conditions.matchAll(/\$(\d+)/g)];
  const maxPlaceholder = placeholders.reduce((m, match) => Math.max(m, parseInt(match[1], 10)), 0);
  if (maxPlaceholder > parsed.params.length) {
    throw new Error(`LLM conditions reference $${maxPlaceholder} but only ${parsed.params.length} params provided`);
  }
  return { conditions: parsed.conditions, params: parsed.params };
}

/**
 * Build hard WHERE conditions from UI-selected filters.
 * Param placeholders start at paramOffset to avoid collision with LLM params.
 * @param {object} filters
 * @param {number} paramOffset - Next available $n index (1-based)
 * @returns {{ conditions: string[], params: Array }}
 */
function buildFilterConditions(filters, paramOffset) {
  const conditions = [];
  const params = [];
  let i = paramOffset;

  if (filters.colors?.length) {
    conditions.push(`we.color = ANY($${i++})`);
    params.push(filters.colors);
  }
  if (filters.countries?.length) {
    conditions.push(`we.country = ANY($${i++})`);
    params.push(filters.countries);
  }
  if (filters.regions?.length) {
    conditions.push(`we.region = ANY($${i++})`);
    params.push(filters.regions);
  }
  if (filters.varietals?.length) {
    conditions.push(`we.varietal = ANY($${i++})`);
    params.push(filters.varietals);
  }
  if (filters.vintageYearMin != null) {
    conditions.push(`we.vintage_year >= $${i++}`);
    params.push(parseInt(filters.vintageYearMin, 10));
  }
  if (filters.vintageYearMax != null) {
    conditions.push(`we.vintage_year <= $${i++}`);
    params.push(parseInt(filters.vintageYearMax, 10));
  }
  if (filters.priceMin != null) {
    conditions.push(`we.price >= $${i++}`);
    params.push(parseFloat(filters.priceMin));
  }
  if (filters.priceMax != null) {
    conditions.push(`we.price <= $${i++}`);
    params.push(parseFloat(filters.priceMax));
  }

  return { conditions, params };
}

/**
 * Build a paginated data query and a matching COUNT query from pre-validated conditions.
 * The data query paginates at the item level using a subquery so each page contains
 * exactly `pageSize` catalog items (not raw rows).
 *
 * @param {string} conditions - Validated SQL WHERE body (no SELECT/FROM/ORDER BY)
 * @param {Array}  conditionParams - Positional params for the conditions ($1…$n)
 * @param {object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.pageSize=20]
 * @returns {{ sql: string, params: Array, countSql: string, conditions: string, conditionParams: Array }}
 */
export function buildPaginatedSql(conditions, conditionParams, opts = {}) {
  const { page = 1, pageSize = 20 } = opts;
  const offset = (page - 1) * pageSize;
  const limitIdx  = conditionParams.length + 1;
  const offsetIdx = conditionParams.length + 2;

  const sql = [
    `SELECT ${SELECT}`,
    FROM,
    `WHERE ${conditions}`,
    `ORDER BY i.title, p.page_number`,
    `LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
  ].join('\n');

  const countSql = [
    `SELECT COUNT(*) AS total`,
    FROM,
    `WHERE ${conditions}`,
  ].join('\n');

  return {
    sql,
    params: [...conditionParams, pageSize, offset],
    countSql,
    conditions,
    conditionParams,
  };
}

/**
 * Convert a natural-language query and/or UI filters into a safe paginated SQL SELECT.
 * Either nlQuery or filters (or both) must be provided.
 * @param {string} nlQuery - May be empty if filters are provided
 * @param {object} [opts]
 * @param {string} [opts.model]
 * @param {object} [opts.filters={}]
 * @param {number} [opts.page=1]
 * @param {number} [opts.pageSize=20]
 * @returns {Promise<{ sql: string, params: Array, countSql: string, conditions: string, conditionParams: Array }>}
 */
export async function generateSql(nlQuery, opts = {}) {
  const { model, filters = {} } = opts;
  const effectiveModel = model || config.samwise.searchModel || undefined;

  // LLM conditions — skip if no natural-language query
  let llmConditions = 'TRUE';
  let llmParams = [];
  if (nlQuery?.trim()) {
    const prompt = buildPrompt(nlQuery);
    const response = await sendText(prompt, { model: effectiveModel, temperature: 0.0, maxTokens: 1000 });
    const parsed = parseResponse(response);
    llmConditions = parsed.conditions;
    llmParams = parsed.params;
  }

  // Filter conditions built deterministically from UI selections
  const { conditions: filterConds, params: filterParams } =
    buildFilterConditions(filters, llmParams.length + 1);

  const allConditions = [llmConditions, ...filterConds].join(' AND ');
  const allParams = [...llmParams, ...filterParams];

  return buildPaginatedSql(allConditions, allParams, opts);
}
