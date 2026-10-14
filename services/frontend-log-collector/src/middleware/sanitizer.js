const BEARER_TOKEN_REGEX = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_TOKEN_REGEX = /\beyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_.+/=]*/g;
const EMAIL_REGEX = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const CARD_DELIMITED_REGEX = /\b(?:\d{4}[ -]){3}\d{1,4}\b/g;
const CARD_RAW_REGEX = /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|6(?:011|5\d{2})\d{12}|3[47]\d{13})\b/g;
const PASSWORD_ASSIGN_REGEX = /((?:["']?password["']?)\s*[:=]\s*["']?)[^\s"',;}&]+/gi;
const COOKIE_ASSIGN_REGEX = /(cookie\s*[:=]\s*)[^\s\r\n;,]+/gi;
const AUTH_HEADER_REGEX = /(authorization\s*[:=]\s*)(?:Bearer\s+\S+|Basic\s+\S+|\S+)/gi;
const SENSITIVE_QUERY_REGEX = /([?&](?:token|access_?token|auth|password|secret|key)=)[^&\s]+/gi;

const SENSITIVE_KEY_REGEX = /(password|passwd|secret|token|auth|cookie|credit_?card|card_?number|cvv|cvc|ssn)/i;
const BODY_KEY_REGEX = /^(body|request_?body|response_?body|req_?body|res_?body|payload)$/i;

function sanitizeString(str) {
  if (typeof str !== 'string') {
    if (str === null || str === undefined) return '';
    try {
      str = String(str);
    } catch (_) {
      return '';
    }
  }

  return str
    .replace(BEARER_TOKEN_REGEX, 'Bearer [REDACTED]')
    .replace(JWT_TOKEN_REGEX, '[REDACTED_TOKEN]')
    .replace(AUTH_HEADER_REGEX, '$1[REDACTED]')
    .replace(COOKIE_ASSIGN_REGEX, '$1[REDACTED]')
    .replace(PASSWORD_ASSIGN_REGEX, '$1[REDACTED]')
    .replace(CARD_DELIMITED_REGEX, '[REDACTED_CARD]')
    .replace(CARD_RAW_REGEX, '[REDACTED_CARD]')
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
    .replace(SENSITIVE_QUERY_REGEX, '$1[REDACTED]');
}

function sanitizeMetadata(data, depth = 0, seen = new WeakSet()) {
  if (data === null || data === undefined) return undefined;
  if (typeof data !== 'object') {
    return typeof data === 'string' ? sanitizeString(data) : data;
  }

  if (seen.has(data) || depth > 5) {
    return '[CIRCULAR]';
  }
  seen.add(data);

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeMetadata(item, depth + 1, seen));
  }

  const result = {};
  for (const key of Object.keys(data)) {
    if (BODY_KEY_REGEX.test(key)) {
      result[key] = '[REDACTED_BODY]';
    } else if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeMetadata(data[key], depth + 1, seen);
    }
  }
  return result;
}

function sanitizeEvent(event) {
  if (!event || typeof event !== 'object') return event;

  return {
    ...event,
    message: sanitizeString(event.message),
    metadata: sanitizeMetadata(event.metadata) || {}
  };
}

function sanitizeLogsMiddleware(req, res, next) {
  if (Array.isArray(req.validatedEvents)) {
    req.validatedEvents = req.validatedEvents.map((evt) => sanitizeEvent(evt));
  }
  next();
}

module.exports = {
  sanitizeString,
  sanitizeMetadata,
  sanitizeEvent,
  sanitizeLogsMiddleware
};
