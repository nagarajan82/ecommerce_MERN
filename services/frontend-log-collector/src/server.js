const app = require('./app');
const config = require('./config/env');

const server = app.listen(config.port, () => {
  console.log(`[FRONTEND LOG COLLECTOR] Running on port ${config.port} (${config.nodeEnv})`);
  if (!config.elasticsearchUrl || !config.elasticApiKey) {
    console.warn('[FRONTEND LOG COLLECTOR] Warning: ELASTICSEARCH_URL or ELASTIC_API_KEY is not set. Logs will not be persisted until configured.');
  }
});

function gracefulShutdown(signal) {
  console.log(`[FRONTEND LOG COLLECTOR] Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    console.log('[FRONTEND LOG COLLECTOR] Server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
