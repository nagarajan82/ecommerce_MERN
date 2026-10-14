jest.mock('@elastic/elasticsearch');

const { Client } = require('@elastic/elasticsearch');
const elasticClient = require('../src/elasticClient');
const { resetCredentialsCache } = require('../src/config');

describe('ElasticClient Service - Isolation & Boundary Mocking', () => {
  let mockBulk;
  let mockIndex;
  let mockPing;
  let savedEnv;

  beforeAll(() => {
    savedEnv = {
      ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL,
      ELASTIC_API_KEY: process.env.ELASTIC_API_KEY,
      BACKEND_LOG_INDEX: process.env.BACKEND_LOG_INDEX,
      API_TELEMETRY_INDEX: process.env.API_TELEMETRY_INDEX
    };
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v !== undefined) process.env[k] = v;
      else delete process.env[k];
    }
    resetCredentialsCache();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBulk = jest.fn();
    mockIndex = jest.fn();
    mockPing = jest.fn();

    Client.mockImplementation(() => ({
      bulk: mockBulk,
      index: mockIndex,
      ping: mockPing
    }));

    elasticClient.resetClient();
  });

  test('reports unconfigured when credentials are missing', async () => {
    delete process.env.ELASTICSEARCH_URL;
    delete process.env.ELASTIC_API_KEY;
    resetCredentialsCache();

    const health = await elasticClient.checkHealth();
    expect(health.configured).toBe(false);
    expect(health.status).toBe('unconfigured');

    await expect(elasticClient.bulkIndex('test-index', [{ test: 1 }])).rejects.toThrow(
      'Elasticsearch storage is not configured'
    );
  });

  test('performs bulk indexing when credentials are configured', async () => {
    process.env.ELASTICSEARCH_URL = 'http://localhost:9200';
    process.env.ELASTIC_API_KEY = 'test-api-key';
    resetCredentialsCache();

    mockBulk.mockResolvedValue({ errors: false, items: [] });

    const res = await elasticClient.bulkIndex('backend-logs', [{ msg: 'hello' }]);
    expect(mockBulk).toHaveBeenCalledTimes(1);
    expect(res.errors).toBe(false);
  });

  test('reports connected when ping succeeds', async () => {
    process.env.ELASTICSEARCH_URL = 'http://localhost:9200';
    process.env.ELASTIC_API_KEY = 'test-api-key';
    resetCredentialsCache();

    mockPing.mockResolvedValue(true);

    const health = await elasticClient.checkHealth();
    expect(health.configured).toBe(true);
    expect(health.status).toBe('connected');
  });
});
