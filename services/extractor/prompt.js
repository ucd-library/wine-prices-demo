/**
 * Build the extraction prompt for a catalog page image.
 * @param {object} [opts]
 * @param {string} [opts.ocrText] - OCR text for the page; included to assist the model
 * @returns {string}
 */
export function buildExtractionPrompt(opts = {}) {
  const { ocrText } = opts;

  let prompt = `You are extracting structured wine pricing data from a historical wine catalog page image.

Return a JSON array of wine entries found on this page. Each entry must have these exact fields (use null for any field not visible on the page):
- wine_name: full name of the wine as printed
- producer: winery or producer name
- vineyard: specific vineyard designation if listed (distinct from producer)
- vintage_year: the wine's vintage year as an integer (not the catalog publication year)
- color: one of "red", "white", "rosé", "sparkling", "dessert", "fortified", or "unknown"
- varietal: grape variety or blend (e.g. "Cabernet Sauvignon", "Chardonnay", "Bordeaux blend")
- region: geographic region (e.g. "Napa Valley", "Burgundy", "Rioja")
- appellation: specific appellation or AVA if more granular than region
- country: country of origin
- price: numeric bottle price, no currency symbol (e.g. 12.99)
- case_price: numeric case price if listed separately
- bottle_size: format string (e.g. "750ml", "1.5L", "375ml")
- rating: integer wine score or points if printed (e.g. 91)
- importer: US importer or distributor name if listed
- description: verbatim tasting notes or catalog description text, if any
- currency: currency code, default "USD"
- confidence: your confidence in this extraction — "high", "medium", or "low"

Rules:
- If this page contains no wine listings, return an empty array: []
- Do not invent or infer data — only extract what is explicitly visible on the page
- Return only the raw JSON array, no markdown fences or other text`;

  if (ocrText) {
    // Include first 3000 chars of OCR as a hint; image takes precedence
    prompt += `\n\nOCR text from this page (use to assist reading; prefer the image for accuracy):\n---\n${ocrText.slice(0, 3000)}\n---`;
  }

  return prompt;
}

/**
 * Parse the LLM's text response into a validated array of wine entry objects.
 * Handles Qwen3 <think>...</think> blocks, markdown fences, and embedded JSON arrays.
 * Returns an empty array if the response cannot be parsed or is not an array.
 * @param {string} responseText
 * @returns {Array<object>}
 */
export function parseExtractionResponse(responseText) {
  try {
    // Strip Qwen3 thinking blocks before attempting to parse
    let cleaned = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Strip markdown code fences
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    // If the text has non-JSON preamble, extract the first JSON array
    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      cleaned = cleaned.slice(arrayStart, arrayEnd + 1);
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((e) => e && typeof e === 'object');
    } catch {
      // Response may be truncated — salvage complete objects before the cutoff
      const entries = [];
      const objRe = /\{[^{}]*\}/gs;
      let match;
      while ((match = objRe.exec(cleaned)) !== null) {
        try {
          const obj = JSON.parse(match[0]);
          if (obj && typeof obj === 'object') entries.push(obj);
        } catch { /* skip malformed fragment */ }
      }
      return entries;
    }
  } catch {
    return [];
  }
}
