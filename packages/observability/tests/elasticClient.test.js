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

  test('returns count 0 if documents empty or null', async () => {
    const resEmpty = await elasticClient.bulkIndex('test', []);
    expect(resEmpty).toEqual({ count: 0 });
    const resNull = await elasticClient.bulkIndex('test', null);
    expect(resNull).toEqual({ count: 0 });
  });

  test('throws ES_BULK_ERROR when bulk response contains errors', async () => {
    process.env.ELASTICSEARCH_URL = 'http://localhost:9200';
    process.env.ELASTIC_API_KEY = 'test-api-key';
    resetCredentialsCache();

    mockBulk.mockResolvedValue({
      errors: true,
      items: [{ index: { error: { reason: 'Mapper parsing exception' } } }]
    });

    await expect(elasticClient.bulkIndex('backend-logs', [{ msg: 'err' }])).rejects.toThrow(
      'Mapper parsing exception'
    );

    mockBulk.mockResolvedValue({
      errors: true,
      items: []
    });

    await expect(elasticClient.bulkIndex('backend-logs', [{ msg: 'err' }])).rejects.toThrow(
      'Bulk indexing encountered errors'
    );
  });

  test('indexDocument indexes single document when configured or throws when not', async () => {
    delete process.env.ELASTICSEARCH_URL;
    delete process.env.ELASTIC_API_KEY;
    resetCredentialsCache();

    await expect(elasticClient.indexDocument('test', { a: 1 })).rejects.toThrow(
      'Elasticsearch storage is not configured'
    );

    process.env.ELASTICSEARCH_URL = 'http://localhost:9200';
    process.env.ELASTIC_API_KEY = 'test-api-key';
    resetCredentialsCache();

    mockIndex.mockResolvedValue({ result: 'created' });
    const res = await elasticClient.indexDocument('test', { a: 1 });
    expect(res.result).toBe('created');
    expect(mockIndex).toHaveBeenCalledWith({ index: 'test', document: { a: 1 } });
  });

  test('reports error status when ping throws', async () => {
    process.env.ELASTICSEARCH_URL = 'http://localhost:9200';
    process.env.ELASTIC_API_KEY = 'test-api-key';
    resetCredentialsCache();

    mockPing.mockRejectedValue(new Error('Connection timeout'));
    const health = await elasticClient.checkHealth();
    expect(health.configured).toBe(true);
    expect(health.status).toBe('error');
    expect(health.message).toBe('Connection timeout');

    mockPing.mockRejectedValue({});
    const healthNoMsg = await elasticClient.checkHealth();
    expect(healthNoMsg.message).toBe('Ping failed');
  });

  test('allows setClient and setClientConstructor', () => {
    const customMock = { ping: jest.fn() };
    elasticClient.setClient(customMock);
    expect(elasticClient.getClient()).toBe(customMock);

    elasticClient.resetClient();
    const mockCtor = function() { return { isCustom: true }; };
    mockCtor._isMockFunction = true;
    elasticClient.setClientConstructor(mockCtor);
    process.env.ELASTICSEARCH_URL = 'http://localhost:9200';
    process.env.ELASTIC_API_KEY = 'test-api-key';
    resetCredentialsCache();
    expect(elasticClient.getClient().isCustom).toBe(true);
  });
});
