const { createLogger, StructuredLogger } = require('./src/logger');
const { createTelemetryMiddleware, TelemetryCollector, getCollector } = require('./src/telemetry');
const { correlationMiddleware, attachProxyCorrelation, generateTraceId } = require('./src/middleware/correlation');
const { createErrorHandler } = require('./src/middleware/errorHandler');
const elasticClient = require('./src/elasticClient');
const { getConfig, resetCredentialsCache } = require('./src/config');
const { sanitizeString, sanitizeObject } = require('./src/utils/sanitizer');

module.exports = {
  createLogger,
  StructuredLogger,
  createTelemetryMiddleware,
  TelemetryCollector,
  getCollector,
  correlationMiddleware,
  attachProxyCorrelation,
  generateTraceId,
  createErrorHandler,
  elasticClient,
  getConfig,
  resetCredentialsCache,
  sanitizeString,
  sanitizeObject
};
