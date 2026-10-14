const { getConfig } = require('./config');
const { bulkIndex } = require('./elasticClient');
const { sanitizeObject, sanitizeString } = require('./utils/sanitizer');

const DEFAULT_CAPACITY = 200;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const MAX_RETRIES = 3;

class StructuredLogger {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName || 'unknown-service';
    this.serviceVersion = options.version || '1.0.0';
    this.capacity = options.capacity || DEFAULT_CAPACITY;
    this.batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS;

    this.queue = [];
    this.buffer = []; // In-memory inspection buffer
    this.flushTimer = null;
    this.isFlushing = false;
    this.retryCount = 0;
    this.isHandlingTransportFailure = false;
  }

  formatEvent(level, message, meta = {}) {
    const config = getConfig();
    const now = new Date().toISOString();

    let errorObj = null;
    if (meta instanceof Error) {
      errorObj = {
        type: meta.name || 'Error',
        message: sanitizeString(meta.message),
        stack_trace: sanitizeString(meta.stack)
      };
      meta = {};
    } else if (meta && meta.error instanceof Error) {
      errorObj = {
        type: meta.error.name || 'Error',
        message: sanitizeString(meta.error.message),
        stack_trace: sanitizeString(meta.error.stack)
      };
      const { error: _omitted, ...rest } = meta;
      meta = rest;
    }

    const sanitizedMeta = sanitizeObject(meta || {});

    const event = {
      '@timestamp': now,
      service: {
        name: this.serviceName,
        version: this.serviceVersion
      },
      environment: config.environment,
      log: {
        level: level.toLowerCase()
      },
      message: sanitizeString(typeof message === 'string' ? message : JSON.stringify(message))
    };

    if (errorObj) {
      event.error = errorObj;
    }

    if (sanitizedMeta.correlationId || sanitizedMeta.requestId || sanitizedMeta['trace.id']) {
      const traceId = sanitizedMeta.correlationId || sanitizedMeta.requestId || sanitizedMeta['trace.id'];
      event.trace = { id: String(traceId) };
      delete sanitizedMeta.correlationId;
      delete sanitizedMeta.requestId;
      delete sanitizedMeta['trace.id'];
    }

    if (sanitizedMeta.method || sanitizedMeta.path || sanitizedMeta.status || sanitizedMeta.statusCode) {
      event.http = {};
      if (sanitizedMeta.method) event.http.request = { method: String(sanitizedMeta.method).toUpperCase() };
      if (sanitizedMeta.status || sanitizedMeta.statusCode) {
        event.http.response = { status_code: Number(sanitizedMeta.status || sanitizedMeta.statusCode) };
      }
      if (sanitizedMeta.path) event.url = { path: String(sanitizedMeta.path) };
      delete sanitizedMeta.method;
      delete sanitizedMeta.status;
      delete sanitizedMeta.statusCode;
      delete sanitizedMeta.path;
    }

    if (Object.keys(sanitizedMeta).length > 0) {
      event.labels = sanitizedMeta;
    }

    return event;
  }

  log(level, message, meta = {}) {
    try {
      const event = this.formatEvent(level, message, meta);

      // 1. Mirror to stdout for Docker / terminal visibility
      this.writeToStdout(event);

      // 2. Buffer & Queue
      this.buffer.push(event);
      while (this.buffer.length > this.capacity) {
        this.buffer.shift();
      }

      this.queue.push(event);
      while (this.queue.length > this.capacity) {
        this.queue.shift();
      }

      // 3. Trigger flush
      if (level === 'error' || this.queue.length >= 10) {
        this.scheduleFlush(0);
      } else {
        this.scheduleFlush(this.flushIntervalMs);
      }

      return event;
    } catch (_) {
      return null;
    }
  }

  writeToStdout(event) {
    if (process.env.NODE_ENV === 'test' && !process.env.DEBUG_TEST_LOGS) {
      return;
    }
    const trace = event.trace ? ` [trace: ${event.trace.id}]` : '';
    const errorMsg = event.error ? ` | Error: ${event.error.type}: ${event.error.message}` : '';
    const line = `[${event['@timestamp']}] [${event.log.level.toUpperCase()}] [${event.service.name}]${trace} ${event.message}${errorMsg}`;
    
    if (event.log.level === 'error') {
      console.error(line);
    } else if (event.log.level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  info(msg, meta) { return this.log('info', msg, meta); }
  warn(msg, meta) { return this.log('warn', msg, meta); }
  error(msg, meta) { return this.log('error', msg, meta); }
  debug(msg, meta) { return this.log('debug', msg, meta); }

  scheduleFlush(delayMs = this.flushIntervalMs) {
    if (this.flushTimer) {
      if (delayMs === 0) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      } else {
        return;
      }
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch(() => {});
    }, delayMs);
  }

  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0 || this.isFlushing) {
      return { success: true, count: 0 };
    }

    this.isFlushing = true;
    const config = getConfig();
    const batchCount = Math.min(this.queue.length, this.batchSize);
    const batch = this.queue.slice(0, batchCount);

    try {
      await bulkIndex(config.backendLogIndex, batch);
      // Remove successfully processed items
      this.queue.splice(0, batchCount);
      this.retryCount = 0;
      return { success: true, count: batchCount };
    } catch (err) {
      this.retryCount += 1;
      if (this.retryCount > MAX_RETRIES) {
        // Drop batch after max retries to prevent unbounded memory growth
        this.queue.splice(0, batchCount);
        this.retryCount = 0;
      } else {
        const backoffMs = Math.min(1000 * Math.pow(2, this.retryCount - 1), 8000);
        this.scheduleFlush(backoffMs);
      }
      return { success: false, error: err && err.message };
    } finally {
      this.isFlushing = false;
    }
  }

  getLogs() {
    return [...this.buffer];
  }

  clearLogs() {
    this.buffer = [];
    this.queue = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.retryCount = 0;
  }
}

const instances = new Map();

function createLogger(serviceName, options = {}) {
  const name = serviceName || 'unknown-service';
  if (!instances.has(name)) {
    instances.set(name, new StructuredLogger(name, options));
  }
  return instances.get(name);
}

module.exports = {
  createLogger,
  StructuredLogger
};
