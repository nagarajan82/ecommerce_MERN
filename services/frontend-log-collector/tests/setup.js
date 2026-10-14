// Global Jest setup for frontend-log-collector tests

// Force NODE_ENV to 'test'
process.env.NODE_ENV = 'test';

// Store reference to initial environment
global.__INITIAL_ENV__ = {
  ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL,
  ELASTIC_API_KEY: process.env.ELASTIC_API_KEY,
  LOG_INDEX: process.env.LOG_INDEX
};

// By default, strip external Elastic Cloud credentials from process.env
// so that all test suites are completely isolated from real credentials.
delete process.env.ELASTICSEARCH_URL;
delete process.env.ELASTIC_API_KEY;
