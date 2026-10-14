const BEARER_TOKEN_REGEX = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_TOKEN_REGEX = /\beyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_.+/=]*/g;
const CARD_DELIMITED_REGEX = /\b(?:\d{4}[ -]){3}\d{1,4}\b/g;
const CARD_RAW_REGEX = /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|6(?:011|5\d{2})\d{12}|3[47]\d{13})\b/g;
const PASSWORD_ASSIGN_REGEX = /((?:["']?password["']?)\s*[:=]\s*["']?)[^\s"',;}&]+/gi;
const COOKIE_ASSIGN_REGEX = /(cookie\s*[:=]\s*)[^\s\r\n;,]+/gi;
const AUTH_HEADER_REGEX = /(authorization\s*[:=]\s*)(?:Bearer\s+\S+|Basic\s+\S+|\S+)/gi;

const SENSITIVE_KEY_REGEX = /(password|passwd|secret|token|auth|cookie|credit_?card|card_?number|cvv|cvc|ssn)/i;

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(BEARER_TOKEN_REGEX, 'Bearer [REDACTED]')
    .replace(JWT_TOKEN_REGEX, '[REDACTED_JWT]')
    .replace(CARD_DELIMITED_REGEX, '[REDACTED_CARD]')
    .replace(CARD_RAW_REGEX, '[REDACTED_CARD]')
    .replace(PASSWORD_ASSIGN_REGEX, '$1[REDACTED]')
    .replace(COOKIE_ASSIGN_REGEX, '$1[REDACTED]')
    .replace(AUTH_HEADER_REGEX, '$1[REDACTED]');
}

function sanitizeObject(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') return sanitizeString(obj);
    return obj;
  }

  if (seen.has(obj)) {
    return '[Circular]';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, seen));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value, seen);
    } else if (typeof value === 'string') {
      result[key] = sanitizeString(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

module.exports = {
  sanitizeString,
  sanitizeObject,
  SENSITIVE_KEY_REGEX
};
