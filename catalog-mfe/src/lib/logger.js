/**
 * Browser-side logger foundation for micro-frontends.
 * Bounded in-memory circular buffer with sensitive-data redaction,
 * deduplication, and reliable asynchronous log delivery to the collector.
 * Zero external dependencies.
 */

const DEFAULT_CAPACITY = 100;
const DEDUPE_WINDOW_MS = 2000;
const DEFAULT_COLLECTOR_URL = 'http://localhost:4006';
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 5000;

// Patterns for sensitive data redaction
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

let localBuffer = [];
let localQueue = [];
let localIsSending = false;
let localRetryCount = 0;
let localFlushTimer = null;
let localCollectorUrl = null;
const recentFingerprints = new Map();

function generateId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return 'log_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function getEnvironment() {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) {
      return process.env.NODE_ENV;
    }
  } catch (_) {}
  return 'development';
}

export function getCollectorUrl() {
  try {
    if (typeof window !== 'undefined' && window) {
      if (window.__APP_LOGGER__ && window.__APP_LOGGER__.collectorUrl) {
        return window.__APP_LOGGER__.collectorUrl;
      }
      if (window.__LOG_COLLECTOR_URL__) {
        return window.__LOG_COLLECTOR_URL__;
      }
    }
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.LOG_COLLECTOR_URL) return process.env.LOG_COLLECTOR_URL;
      if (process.env.REACT_APP_LOG_COLLECTOR_URL) return process.env.REACT_APP_LOG_COLLECTOR_URL;
      if (process.env.VITE_LOG_COLLECTOR_URL) return process.env.VITE_LOG_COLLECTOR_URL;
    }
  } catch (_) {}
  return localCollectorUrl || DEFAULT_COLLECTOR_URL;
}

function getSharedState() {
  try {
    if (typeof window !== 'undefined' && window) {
      if (!window.__APP_LOGGER__ || typeof window.__APP_LOGGER__ !== 'object') {
        window.__APP_LOGGER__ = {
          buffer: [],
          queue: [],
          capacity: DEFAULT_CAPACITY,
          collectorUrl: null,
          isSending: false,
          retryCount: 0,
          flushTimer: null,
          getLogs,
          clearLogs,
          flushLogs,
          configureLogger
        };
      } else {
        if (!Array.isArray(window.__APP_LOGGER__.buffer)) {
          window.__APP_LOGGER__.buffer = [];
        }
        if (!Array.isArray(window.__APP_LOGGER__.queue)) {
          window.__APP_LOGGER__.queue = [];
        }
        if (typeof window.__APP_LOGGER__.capacity !== 'number') {
          window.__APP_LOGGER__.capacity = DEFAULT_CAPACITY;
        }
        if (typeof window.__APP_LOGGER__.isSending !== 'boolean') {
          window.__APP_LOGGER__.isSending = false;
        }
        if (typeof window.__APP_LOGGER__.retryCount !== 'number') {
          window.__APP_LOGGER__.retryCount = 0;
        }
        if (typeof window.__APP_LOGGER__.getLogs !== 'function') {
          window.__APP_LOGGER__.getLogs = getLogs;
        }
        if (typeof window.__APP_LOGGER__.clearLogs !== 'function') {
          window.__APP_LOGGER__.clearLogs = clearLogs;
        }
        if (typeof window.__APP_LOGGER__.flushLogs !== 'function') {
          window.__APP_LOGGER__.flushLogs = flushLogs;
        }
        if (typeof window.__APP_LOGGER__.configureLogger !== 'function') {
          window.__APP_LOGGER__.configureLogger = configureLogger;
        }
      }
      return window.__APP_LOGGER__;
    }
  } catch (_) {}
  return null;
}

function getBuffer() {
  const shared = getSharedState();
  if (shared && Array.isArray(shared.buffer)) {
    return shared.buffer;
  }
  return localBuffer;
}

export function getQueue() {
  const shared = getSharedState();
  if (shared && Array.isArray(shared.queue)) {
    return [...shared.queue];
  }
  return [...localQueue];
}

export function configureLogger(options = {}) {
  const shared = getSharedState();
  if (options && typeof options.collectorUrl === 'string') {
    if (shared) shared.collectorUrl = options.collectorUrl.trim();
    localCollectorUrl = options.collectorUrl.trim();
  }
  if (options && typeof options.capacity === 'number' && options.capacity > 0) {
    if (shared) shared.capacity = options.capacity;
  }
}

export function sanitizeString(str) {
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

export function sanitizeMetadata(data, depth = 0, seen = new WeakSet()) {
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

  if (data instanceof Error || (typeof data.message === 'string' && typeof data.name === 'string')) {
    return {
      name: sanitizeString(data.name),
      message: sanitizeString(data.message),
      stack: sanitizeString(data.stack || '')
    };
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

export function clearLogs() {
  try {
    const shared = getSharedState();
    if (shared) {
      if (Array.isArray(shared.buffer)) shared.buffer.length = 0;
      if (Array.isArray(shared.queue)) shared.queue.length = 0;
      shared.retryCount = 0;
      shared.isSending = false;
      if (shared.flushTimer) {
        clearTimeout(shared.flushTimer);
        shared.flushTimer = null;
      }
    }
  } catch (_) {}
  localBuffer.length = 0;
  localQueue.length = 0;
  localRetryCount = 0;
  localIsSending = false;
  if (localFlushTimer) {
    clearTimeout(localFlushTimer);
    localFlushTimer = null;
  }
  recentFingerprints.clear();
}

export function getLogs() {
  try {
    const buf = getBuffer();
    return [...buf];
  } catch (_) {
    return [];
  }
}

function getFingerprint(level, category, appName, message) {
  return `${level}:${category}:${appName}:${message}`;
}

export function scheduleFlush(delayMs = DEFAULT_FLUSH_INTERVAL_MS) {
  const shared = getSharedState();
  const currentTimer = shared ? shared.flushTimer : localFlushTimer;
  if (currentTimer) {
    if (delayMs === 0) {
      clearTimeout(currentTimer);
    } else {
      return;
    }
  }

  const timer = setTimeout(() => {
    if (shared) shared.flushTimer = null;
    else localFlushTimer = null;
    flushLogs().catch(() => {});
  }, delayMs);

  if (shared) shared.flushTimer = timer;
  else localFlushTimer = timer;
}

function handleTransportFailure(shared, queue, batchCount) {
  const retryCount = (shared ? shared.retryCount : localRetryCount) + 1;
  if (shared) shared.retryCount = retryCount;
  else localRetryCount = retryCount;

  if (retryCount > MAX_RETRIES) {
    // Drop the batch to prevent buffer starvation and infinite retry loops
    queue.splice(0, batchCount);
    if (shared) shared.retryCount = 0;
    else localRetryCount = 0;
  } else {
    // Exponential backoff: 1s, 2s, 4s
    const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 8000);
    scheduleFlush(backoffMs);
  }
}

export async function flushLogs() {
  const shared = getSharedState();
  if (shared && shared.flushTimer) {
    clearTimeout(shared.flushTimer);
    shared.flushTimer = null;
  }
  if (localFlushTimer) {
    clearTimeout(localFlushTimer);
    localFlushTimer = null;
  }

  const queue = shared ? shared.queue : localQueue;

  if (!queue || queue.length === 0) {
    return { success: true, count: 0 };
  }

  const isSending = shared ? shared.isSending : localIsSending;
  if (isSending) {
    return { success: false, inFlight: true };
  }

  if (shared) shared.isSending = true;
  else localIsSending = true;

  const batchCount = Math.min(queue.length, DEFAULT_BATCH_SIZE);
  const batch = queue.slice(0, batchCount);
  const collectorUrl = getCollectorUrl();
  const endpoint = `${collectorUrl.replace(/\/+$/, '')}/api/logs`;

  try {
    let controller = null;
    let timeoutId = null;

    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      timeoutId = setTimeout(() => {
        try { controller.abort(); } catch (_) {}
      }, REQUEST_TIMEOUT_MS);
    }

    const fetchFn = typeof fetch === 'function' ? fetch : (typeof window !== 'undefined' ? window.fetch : null);
    if (!fetchFn) {
      return { success: false, noFetch: true };
    }

    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(batch),
      signal: controller ? controller.signal : undefined
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (response && (response.status === 200 || response.status === 201)) {
      queue.splice(0, batchCount);
      if (shared) shared.retryCount = 0;
      else localRetryCount = 0;

      // Flush remaining if any
      if (queue.length > 0) {
        scheduleFlush(50);
      }
      return { success: true, count: batchCount };
    } else if (response && response.status >= 400 && response.status < 500) {
      // Client validation failure: drop invalid batch to avoid infinite loop
      queue.splice(0, batchCount);
      if (shared) shared.retryCount = 0;
      else localRetryCount = 0;
      return { success: false, status: response.status };
    } else {
      // Server error or unexpected response: retry
      handleTransportFailure(shared, queue, batchCount);
      return { success: false, status: response ? response.status : 'error' };
    }
  } catch (err) {
    // Silently handle transport network failures without throwing or logging recursively
    handleTransportFailure(shared, queue, batchCount);
    return { success: false, error: err };
  } finally {
    if (shared) shared.isSending = false;
    else localIsSending = false;
  }
}

function pushLog(event) {
  const buf = getBuffer();
  const fp = getFingerprint(event.level, event.category, event.appName, event.message);
  const now = Date.now();

  const existing = recentFingerprints.get(fp);
  if (existing && (now - existing.timestamp < DEDUPE_WINDOW_MS)) {
    existing.event.duplicateCount = (existing.event.duplicateCount || 1) + 1;
    existing.timestamp = now;
    return;
  }

  event.duplicateCount = 1;
  recentFingerprints.set(fp, { timestamp: now, event });

  // Prevent unbounded growth of fingerprint map
  if (recentFingerprints.size > 200) {
    for (const [key, val] of recentFingerprints.entries()) {
      if (now - val.timestamp > DEDUPE_WINDOW_MS) {
        recentFingerprints.delete(key);
      }
    }
  }

  // 1. In-memory circular buffer
  buf.push(event);
  const shared = getSharedState();
  const max = (shared && typeof shared.capacity === 'number') ? shared.capacity : DEFAULT_CAPACITY;
  while (buf.length > max) {
    buf.shift();
  }

  // 2. Outgoing transmission queue
  const queue = shared ? shared.queue : localQueue;
  queue.push(event);
  while (queue.length > max) {
    queue.shift();
  }

  // 3. Trigger flush
  if (event.level === 'error' || queue.length >= 10) {
    scheduleFlush(0);
  } else {
    scheduleFlush(DEFAULT_FLUSH_INTERVAL_MS);
  }
}

export function createLogger(appName = 'unknown-app') {
  const normalizedAppName = typeof appName === 'string' && appName.trim() ? appName.trim() : 'unknown-app';

  function log(level, message, metadata) {
    try {
      let finalMessage = message;
      let finalMeta = metadata;

      if (message instanceof Error) {
        finalMeta = { error: message, ...(finalMeta && typeof finalMeta === 'object' ? finalMeta : {}) };
        finalMessage = message.message;
      } else if (metadata instanceof Error) {
        finalMeta = { error: metadata };
      }

      let category = 'application';
      let cleanedMetadata = finalMeta;

      if (finalMeta && typeof finalMeta === 'object' && !Array.isArray(finalMeta) && !(finalMeta instanceof Error)) {
        if ('category' in finalMeta) {
          category = String(finalMeta.category);
          const { category: _omitted, ...rest } = finalMeta;
          cleanedMetadata = rest;
        }
      }

      const event = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        level,
        category,
        appName: normalizedAppName,
        environment: getEnvironment(),
        message: sanitizeString(finalMessage),
        metadata: sanitizeMetadata(cleanedMetadata) || {}
      };

      pushLog(event);
      return event;
    } catch (_) {
      return null;
    }
  }

  return {
    appName: normalizedAppName,
    error: (msg, meta) => log('error', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    getLogs,
    clearLogs,
    flush: flushLogs,
    getQueue
  };
}

function setupLifecycleListeners() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__LOGGER_LIFECYCLE_INITIALIZED__) return;
  window.__LOGGER_LIFECYCLE_INITIALIZED__ = true;

  function flushOnExit() {
    const shared = getSharedState();
    const queue = shared ? shared.queue : localQueue;
    if (!queue || queue.length === 0) return;

    const batch = queue.slice(0, DEFAULT_BATCH_SIZE);
    const collectorUrl = getCollectorUrl();
    const endpoint = `${collectorUrl.replace(/\/+$/, '')}/api/logs`;
    const payload = JSON.stringify(batch);

    let sent = false;
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([payload], { type: 'application/json' });
        sent = navigator.sendBeacon(endpoint, blob);
      } catch (_) {}
    }

    if (!sent && typeof fetch === 'function') {
      try {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(() => {});
      } catch (_) {}
    }
  }

  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushOnExit();
      }
    });
    window.addEventListener('beforeunload', () => {
      flushOnExit();
    });
  } catch (_) {}
}

setupLifecycleListeners();

export function initGlobalErrorHandlers(appName = 'unknown-app') {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (window.__GLOBAL_ERROR_HANDLERS_INSTALLED__) {
    return () => {};
  }

  window.__GLOBAL_ERROR_HANDLERS_INSTALLED__ = true;
  const logger = createLogger(appName);

  function onError(event) {
    try {
      if (event && event.error && event.error.__handledByBoundary) {
        return;
      }
      const message =
        (event && event.message) ||
        (event && event.error && event.error.message) ||
        'Uncaught error';
      const errorObj = (event && event.error) instanceof Error ? event.error : null;

      logger.error(message, {
        category: 'runtime_error',
        error: errorObj || {
          name: 'Error',
          message,
          filename: event ? event.filename : undefined,
          lineno: event ? event.lineno : undefined,
          colno: event ? event.colno : undefined
        }
      });
    } catch (_) {}
  }

  function onUnhandledRejection(event) {
    try {
      const reason = event && event.reason;
      if (reason && typeof reason === 'object' && reason.__handledByBoundary) {
        return;
      }
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection';
      const errorObj = reason instanceof Error ? reason : null;

      logger.error(message, {
        category: 'unhandled_rejection',
        error: errorObj || {
          name: 'UnhandledRejection',
          message: String(reason || 'Unhandled promise rejection')
        }
      });
    } catch (_) {}
  }

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return function cleanup() {
    try {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      delete window.__GLOBAL_ERROR_HANDLERS_INSTALLED__;
    } catch (_) {}
  };
}

export default {
  createLogger,
  getLogs,
  getQueue,
  clearLogs,
  flushLogs,
  configureLogger,
  getCollectorUrl,
  sanitizeString,
  sanitizeMetadata,
  initGlobalErrorHandlers
};
