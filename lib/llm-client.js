import config from '../config/index.js';

/**
 * Send a text-only chat completion to Samwise (vLLM OpenAI-compatible API).
 * @param {string} prompt - User message text
 * @param {object} [opts]
 * @param {string} [opts.model] - Override the configured model
 * @param {string} [opts.systemPrompt]
 * @param {number} [opts.maxTokens=4096]
 * @param {number} [opts.temperature=0.1]
 * @param {function} [opts.onChunk] - Streaming callback: (tokenCount: number) => void
 * @returns {Promise<string>} Assistant response text
 */
export async function sendText(prompt, opts = {}) {
  const { model, systemPrompt, maxTokens = 4096, temperature = 0.1, onChunk } = opts;
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  return complete(messages, { model, maxTokens, temperature, onChunk });
}

/**
 * Send a vision request with a base64-encoded image and text prompt.
 * @param {string} base64Image - Raw base64 image data (no data URI prefix)
 * @param {string} mimeType - e.g. "image/jpeg"
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens=4096]
 * @param {number} [opts.temperature=0.1]
 * @param {function} [opts.onChunk] - Streaming callback: (tokenCount: number) => void
 * @returns {Promise<string>} Assistant response text
 */
export async function sendVision(base64Image, mimeType, prompt, opts = {}) {
  const { model, maxTokens = 4096, temperature = 0.1, onChunk } = opts;
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}` },
        },
        { type: 'text', text: prompt },
      ],
    },
  ];
  return complete(messages, { model, maxTokens, temperature, onChunk });
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Consume an SSE streaming response, calling onChunk on each received token.
 * Returns the fully assembled response text.
 * @param {Response} res
 * @param {function} onChunk - (tokenCount: number) => void
 * @returns {Promise<string>}
 */
async function readStream(res, onChunk) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let tokenCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            tokenCount++;
            onChunk(tokenCount);
          }
        } catch { /* skip malformed SSE chunk */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

/**
 * POST to the completions endpoint with retry on timeout/5xx.
 * Uses streaming when onChunk is provided.
 * @param {Array<object>} messages
 * @param {object} opts
 * @param {string} [opts.model]
 * @param {number} opts.maxTokens
 * @param {number} opts.temperature
 * @param {number} [opts.maxRetries=2]
 * @param {function} [opts.onChunk] - If provided, enables SSE streaming
 * @returns {Promise<string>}
 */
async function complete(messages, opts) {
  const { model = config.samwise.model, maxTokens, temperature, maxRetries = 2, onChunk } = opts;
  const url = `${config.samwise.baseUrl}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (config.samwise.apiKey) {
    headers['Authorization'] = `Bearer ${config.samwise.apiKey}`;
    headers['x-api-key'] = config.samwise.apiKey;
  }
  const body = JSON.stringify({
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    chat_template_kwargs: { enable_thinking: false },
    stream: !!onChunk,
  });

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = 15_000 * attempt;
      console.warn(`  LLM retry ${attempt}/${maxRetries} after ${delay / 1000}s...`);
      await sleep(delay);
    }

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(20 * 60 * 1000),
      });
    } catch (err) {
      const reason = err.name === 'TimeoutError'
        ? 'request timed out after 20 minutes'
        : `${err.message}${err.cause ? ` — ${err.cause.message ?? err.cause}` : ''}`;
      lastErr = new Error(`LLM connection failed (${url}): ${reason}`);
      continue;
    }

    if (res.status >= 500) {
      const text = await res.text().catch(() => '');
      lastErr = new Error(`LLM API ${res.status}: ${text.slice(0, 200)}`);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM API ${res.status}: ${text.slice(0, 200)}`);
    }

    if (onChunk) return readStream(res, onChunk);

    const data = await res.json();
    return data.choices[0].message.content;
  }

  throw lastErr;
}
