const path = require('path');

// Only load .env if NOT in test environment, avoiding test contamination from local credentials
if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
}

function parseOrigins(raw) {
  if (!raw) {
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004'
    ];
  }
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

module.exports = {
  get port() {
    return parseInt(process.env.PORT, 10) || 4006;
  },
  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  },
  get elasticsearchUrl() {
    return (process.env.ELASTICSEARCH_URL || '').trim();
  },
  get elasticApiKey() {
    return (process.env.ELASTIC_API_KEY || '').trim();
  },
  get logIndex() {
    return (process.env.LOG_INDEX || 'frontend-logs').trim();
  },
  get allowedOrigins() {
    return parseOrigins(process.env.FRONTEND_ORIGIN);
  },
  get rateLimitWindowMs() {
    return parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000;
  },
  get rateLimitMax() {
    return parseInt(process.env.RATE_LIMIT_MAX, 10) || 100;
  },
  get maxBatchSize() {
    return parseInt(process.env.MAX_BATCH_SIZE, 10) || 50;
  }
};
