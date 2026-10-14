const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

let loadedCredentials = null;

function resolveCollectorEnv() {
  if (loadedCredentials) return loadedCredentials;

  let url = (process.env.ELASTICSEARCH_URL || '').trim();
  let key = (process.env.ELASTIC_API_KEY || '').trim();

  if ((!url || !key) && process.env.NODE_ENV !== 'test') {
    const candidatePaths = [
      path.resolve(__dirname, '../../../services/frontend-log-collector/.env'),
      path.resolve(__dirname, '../../services/frontend-log-collector/.env'),
      path.resolve(process.cwd(), 'services/frontend-log-collector/.env'),
      path.resolve(process.cwd(), '../frontend-log-collector/.env')
    ];

    for (const envPath of candidatePaths) {
      if (fs.existsSync(envPath)) {
        try {
          const content = fs.readFileSync(envPath, 'utf8');
          const parsed = dotenv.parse(content);
          if (!url && parsed.ELASTICSEARCH_URL) {
            url = parsed.ELASTICSEARCH_URL.trim();
          }
          if (!key && parsed.ELASTIC_API_KEY) {
            key = parsed.ELASTIC_API_KEY.trim();
          }
          if (url && key) break;
        } catch (_) {}
      }
    }
  }

  loadedCredentials = { url, key };
  return loadedCredentials;
}

function getConfig() {
  const { url, key } = resolveCollectorEnv();

  return {
    elasticsearchUrl: (process.env.ELASTICSEARCH_URL || url || '').trim(),
    elasticApiKey: (process.env.ELASTIC_API_KEY || key || '').trim(),
    backendLogIndex: (process.env.BACKEND_LOG_INDEX || 'backend-logs').trim(),
    apiTelemetryIndex: (process.env.API_TELEMETRY_INDEX || 'api-telemetry').trim(),
    environment: process.env.NODE_ENV || 'development',
    swaggerStatsUser: process.env.SWAGGER_STATS_USER || 'admin',
    swaggerStatsPassword: process.env.SWAGGER_STATS_PASSWORD || 'admin123'
  };
}

module.exports = {
  getConfig,
  resetCredentialsCache: () => {
    loadedCredentials = null;
  }
};
