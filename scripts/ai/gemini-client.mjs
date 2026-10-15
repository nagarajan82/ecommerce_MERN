/**
 * Google Gemini API Client & Secret Sanitization Utility
 * Supports Google Gemini 2.5/3.x models via native fetch.
 */

const SECRET_PATTERNS = [
  // GitHub tokens (PAT, OAuth, app tokens)
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  // Google API keys
  /AIza[0-9A-Za-z-_]{25,}/g,
  // Generic Bearer tokens
  /Bearer\s+[A-Za-z0-9\-_.]+/gi,
  // JWT tokens
  /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*/g,
  // Private key blocks
  /-----BEGIN [A-Z\s]+PRIVATE KEY-----[\s\S]*?-----END [A-Z\s]+PRIVATE KEY-----/g,
  // Common key/secret assignments (e.g. SONAR_TOKEN=xxx, password: 'xxx')
  /(?<=\b(?:password|passwd|secret|api[_-]?key|token|auth|credentials)\s*[:=]\s*["']?)[A-Za-z0-9_\-.~!@#$%^&*+=]{6,}(?=["']?)/gi,
  // Masked secrets from CI
  /\*{4,}/g
];

/**
 * Scrubs known secret patterns from text before transmission.
 * @param {string} text
 * @returns {string} Sanitized text
 */
export function scrubSecrets(text) {
  if (!text || typeof text !== 'string') return '';
  let sanitized = text;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
  }
  return sanitized;
}

/**
 * Invokes the Gemini generateContent REST endpoint with retry and timeout.
 * @param {Object} options
 * @param {string} options.apiKey - Gemini API key
 * @param {string} [options.model] - Gemini model identifier (default: gemini-2.5-flash)
 * @param {string} [options.systemInstruction] - System instruction guiding model persona
 * @param {string} options.userPrompt - User prompt (will be sanitized)
 * @param {number} [options.temperature] - Generation temperature (default: 0.2)
 * @param {number} [options.maxOutputTokens] - Max output tokens (default: 2048)
 * @param {number} [options.timeoutMs] - Request timeout in ms (default: 45000)
 * @param {number} [options.retries] - Number of retries on 429/503 (default: 2)
 * @returns {Promise<{ text: string, finishReason: string, usage?: object }>}
 */
export async function callGemini({
  apiKey,
  model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  systemInstruction = '',
  userPrompt,
  temperature = 0.2,
  maxOutputTokens = 2048,
  timeoutMs = 45000,
  retries = 2
}) {
  if (!apiKey) {
    throw new Error('callGemini: Missing apiKey argument');
  }
  if (!userPrompt) {
    throw new Error('callGemini: Missing userPrompt argument');
  }

  const sanitizedPrompt = scrubSecrets(userPrompt);
  const sanitizedInstruction = systemInstruction ? scrubSecrets(systemInstruction) : '';

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: sanitizedPrompt }]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens
    }
  };

  if (sanitizedInstruction) {
    payload.systemInstruction = {
      parts: [{ text: sanitizedInstruction }]
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          'User-Agent': 'ecommerce-mern-ai-agent/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutTimer);

      if (response.ok) {
        const data = await response.json();
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text || '';
        const finishReason = candidate?.finishReason || 'UNKNOWN';

        if (finishReason === 'SAFETY') {
          return {
            text: '⚠️ **Review Notice:** The response was filtered by Gemini safety settings.',
            finishReason,
            usage: data.usageMetadata
          };
        }

        return {
          text,
          finishReason,
          usage: data.usageMetadata
        };
      }

      // Handle Rate Limit (429) or Service Unavailable (503)
      if ((response.status === 429 || response.status === 503) && attempt < retries) {
        const delay = Math.pow(2, attempt) * 2000;
        console.warn(`[Gemini API] Received HTTP ${response.status}. Retrying in ${delay}ms (attempt ${attempt + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      const errorBody = await response.text().catch(() => '');
      throw new Error(`Gemini API HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
    } catch (err) {
      clearTimeout(timeoutTimer);
      lastError = err;
      if (err.name === 'AbortError') {
        throw new Error(`Gemini API request timed out after ${timeoutMs}ms`);
      }
      if (attempt === retries) {
        break;
      }
    }
  }

  throw lastError;
}
