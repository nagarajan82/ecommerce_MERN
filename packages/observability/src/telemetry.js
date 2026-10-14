const swStats = require('swagger-stats');
const { getConfig } = require('./config');
const { bulkIndex } = require('./elasticClient');
const { sanitizeObject, sanitizeString } = require('./utils/sanitizer');

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const MAX_CAPACITY = 200;
const MAX_RETRIES = 3;

class TelemetryCollector {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName || 'unknown-service';
    this.serviceType = options.serviceType || (serviceName.includes('gateway') ? 'gateway' : 'microservice');
    this.batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS;
    this.capacity = options.capacity || MAX_CAPACITY;

    this.queue = [];
    this.buffer = []; // for inspection in tests
    this.flushTimer = null;
    this.isFlushing = false;
    this.retryCount = 0;
  }

  formatTelemetryRecord(req, res, rrr = {}) {
    const config = getConfig();
    const timestamp = rrr.startts ? new Date(rrr.startts).toISOString() : new Date().toISOString();
    const duration = typeof rrr.duration === 'number' ? rrr.duration : (
      rrr.endts && rrr.startts ? (rrr.endts - rrr.startts) : 0
    );

    const correlationId = (req && req.correlationId) ||
      (req && req.headers && (req.headers['x-correlation-id'] || req.headers['x-request-id'])) ||
      null;

    const rawPath = rrr.path || (req && (req.baseUrl + (req.path || ''))) || (req && req.originalUrl) || '/';
    const method = (rrr.method || (req && req.method) || 'GET').toUpperCase();
    const statusCode = Number(rrr.code || (res && res.statusCode) || 200);

    const doc = {
      '@timestamp': timestamp,
      service: {
        name: this.serviceName,
        type: this.serviceType
      },
      environment: config.environment,
      http: {
        request: {
          method,
          body: {
            bytes: Number(rrr.req_clength || (req && req.headers && req.headers['content-length']) || 0)
          }
        },
        response: {
          status_code: statusCode,
          duration_ms: Math.round(duration * 100) / 100,
          body: {
            bytes: Number(rrr.res_clength || 0)
          }
        },
        route: sanitizeString(rawPath)
      },
      url: {
        path: sanitizeString(rawPath)
      },
      telemetry: {
        success: statusCode < 400,
        status_class: `${Math.floor(statusCode / 100)}xx`,
        is_slow: duration > 1000
      }
    };

    if (correlationId) {
      doc.trace = { id: String(correlationId) };
    }

    if (req && req.ip) {
      doc.network = { client: { ip: sanitizeString(req.ip) } };
    }

    if (rrr.query && typeof rrr.query === 'object') {
      doc.url.query = sanitizeObject(rrr.query);
    }

    return doc;
  }

  record(req, res, rrr) {
    try {
      const doc = this.formatTelemetryRecord(req, res, rrr);

      this.buffer.push(doc);
      while (this.buffer.length > this.capacity) {
        this.buffer.shift();
      }

      this.queue.push(doc);
      while (this.queue.length > this.capacity) {
        this.queue.shift();
      }

      if (doc.http.response.status_code >= 500 || this.queue.length >= 10) {
        this.scheduleFlush(0);
      } else {
        this.scheduleFlush(this.flushIntervalMs);
      }

      return doc;
    } catch (_) {
      return null;
    }
  }

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
      await bulkIndex(config.apiTelemetryIndex, batch);
      this.queue.splice(0, batchCount);
      this.retryCount = 0;
      return { success: true, count: batchCount };
    } catch (err) {
      this.retryCount += 1;
      if (this.retryCount > MAX_RETRIES) {
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

  getRecords() {
    return [...this.buffer];
  }

  clearRecords() {
    this.buffer = [];
    this.queue = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.retryCount = 0;
  }
}

const collectors = new Map();

function getCollector(serviceName, options = {}) {
  const name = serviceName || 'unknown-service';
  if (!collectors.has(name)) {
    collectors.set(name, new TelemetryCollector(name, options));
  }
  return collectors.get(name);
}

function createTelemetryMiddleware(serviceName, options = {}) {
  const config = getConfig();
  const collector = getCollector(serviceName, options);

  const swStatsConfig = {
    name: serviceName,
    version: options.version || '1.0.0',
    uriPath: options.uriPath || '/swagger-stats',
    // Secure the /swagger-stats dashboard UI
    authentication: options.authentication !== false,
    onAuthenticate: (req, username, password) => {
      const expectedUser = options.username || config.swaggerStatsUser;
      const expectedPass = options.password || config.swaggerStatsPassword;
      return username === expectedUser && password === expectedPass;
    },
    // Hook onResponseFinish to ship sanitized telemetry to api-telemetry index
    onResponseFinish: (req, res, rrr) => {
      try {
        collector.record(req, res, rrr);
      } catch (_) {}
    }
  };

  if (options.swaggerSpec) {
    swStatsConfig.swaggerSpec = options.swaggerSpec;
  }

  const middleware = swStats.getMiddleware(swStatsConfig);

  // Return wrapped middleware with attached collector for testing
  middleware.collector = collector;
  return middleware;
}

module.exports = {
  createTelemetryMiddleware,
  TelemetryCollector,
  getCollector
};
