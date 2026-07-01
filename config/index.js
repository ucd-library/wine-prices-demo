/**
 * Central application configuration read from environment variables.
 * Throws on startup if any required variable is missing.
 *
 * Loads .env from process.cwd() if present. Existing env vars take precedence.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

/**
 * @param {string} name
 * @returns {string}
 */
function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

/**
 * @param {string} name
 * @param {string} defaultValue
 * @returns {string}
 */
function optional(name, defaultValue) {
  return process.env[name] ?? defaultValue;
}

const config = {
  ldp: {
    host: optional('LDP_HOST', 'https://digital.ucdavis.edu'),
    collectionArk: optional('COLLECTION_ARK', 'ark:/13030/c8pc37z3'),
  },
  samwise: {
    baseUrl: required('SAMWISE_BASE_URL'),
    model: optional('SAMWISE_MODEL', 'qwen3.6-fast:35b'),
    searchModel: optional('SAMWISE_SEARCH_MODEL', ''),
    apiKey: optional('SAMWISE_API_KEY', ''),
  },
  db: {
    url: required('DATABASE_URL'),
  },
  storage: {
    imageDir: optional('IMAGE_DIR', '/data/images'),
  },
  concurrency: {
    crawl: parseInt(optional('CRAWL_CONCURRENCY', '3'), 10),
    extract: parseInt(optional('EXTRACT_CONCURRENCY', '2'), 10),
  },
  api: {
    port: parseInt(optional('PORT', '3000'), 10),
  },
};

export default config;
