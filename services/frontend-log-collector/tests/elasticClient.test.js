// Boundary Mock: Mock the @elastic/elasticsearch module so that NO real network calls can occur
jest.mock('@elastic/elasticsearch');

const { Client } = require('@elastic/elasticsearch');
const elasticClient = require('../src/services/elasticClient');

describe('ElasticClient Service - Isolation & Boundary Mocking', () => {
  let mockIndex;
  let mockBulk;
  let mockPing;
  let savedEnv;

  beforeAll(() => {
    savedEnv = {
      ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL,
      ELASTIC_API_KEY: process.env.ELASTIC_API_KEY,
      LOG_INDEX: process.env.LOG_INDEX
    };
  });

  afterAll(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIndex = jest.fn();
    mockBulk = jest.fn();
    mockPing = jest.fn();

    // Default mock client implementation
    Client.mockImplementation((options) => ({
      index: mockIndex,
      bulk: mockBulk,
      ping: mockPing,
      options
    }));

    elasticClient.resetClient();
  });

  describe('Unconfigured Scenario (No credentials in environment)', () => {
    beforeEach(() => {
      // Explicitly remove credentials to guarantee unconfigured state
      delete process.env.ELASTICSEARCH_URL;
      delete process.env.ELASTIC_API_KEY;
      elasticClient.resetClient();
    });

    it('getClient() returns null when environment is unconfigured', () => {
      expect(elasticClient.getClient()).toBeNull();
      expect(Client).not.toHaveBeenCalled();
    });

    it('checkHealth() reports unconfigured without making any network calls', async () => {
      const health = await elasticClient.checkHealth();
      expect(health).toEqual({
        configured: false,
        status: 'unconfigured'
      });
      expect(Client).not.toHaveBeenCalled();
      expect(mockPing).not.toHaveBeenCalled();
    });

    it('indexLog() throws ES_NOT_CONFIGURED error without calling Client', async () => {
      await expect(
        elasticClient.indexLog({ id: 'evt-1', message: 'test unconfigured' })
      ).rejects.toMatchObject({
        code: 'ES_NOT_CONFIGURED',
        message: 'Elasticsearch storage is not configured'
      });
      expect(Client).not.toHaveBeenCalled();
      expect(mockIndex).not.toHaveBeenCalled();
    });

    it('indexLogsBulk() throws ES_NOT_CONFIGURED error without calling Client', async () => {
      await expect(
        elasticClient.indexLogsBulk([{ id: 'evt-1', message: 'test unconfigured' }])
      ).rejects.toMatchObject({
        code: 'ES_NOT_CONFIGURED',
        message: 'Elasticsearch storage is not configured'
      });
      expect(Client).not.toHaveBeenCalled();
      expect(mockBulk).not.toHaveBeenCalled();
    });
  });

  describe('Configured Scenario (With mocked Elasticsearch Client)', () => {
    const MOCK_ES_URL = 'https://mock-cluster.es.io:9243';
    const MOCK_API_KEY = 'mock-test-api-key-base64';

    beforeEach(() => {
      process.env.ELASTICSEARCH_URL = MOCK_ES_URL;
      process.env.ELASTIC_API_KEY = MOCK_API_KEY;
      process.env.LOG_INDEX = 'test-frontend-logs';
      elasticClient.resetClient();
    });

    afterEach(() => {
      delete process.env.ELASTICSEARCH_URL;
      delete process.env.ELASTIC_API_KEY;
      delete process.env.LOG_INDEX;
      elasticClient.resetClient();
    });

    it('instantiates Client with configured URL and API Key', () => {
      const client = elasticClient.getClient();
      expect(client).toBeDefined();
      expect(Client).toHaveBeenCalledTimes(1);
      expect(Client).toHaveBeenCalledWith({
        node: MOCK_ES_URL,
        auth: {
          apiKey: MOCK_API_KEY
        }
      });
    });

    it('checkHealth() reports connected when ping resolves true', async () => {
      mockPing.mockResolvedValue(true);

      const health = await elasticClient.checkHealth();
      expect(health).toEqual({
        configured: true,
        status: 'connected'
      });
      expect(mockPing).toHaveBeenCalledTimes(1);
    });

    it('checkHealth() reports unreachable when ping resolves false', async () => {
      mockPing.mockResolvedValue(false);

      const health = await elasticClient.checkHealth();
      expect(health).toEqual({
        configured: true,
        status: 'unreachable'
      });
      expect(mockPing).toHaveBeenCalledTimes(1);
    });

    it('checkHealth() reports disconnected when ping rejects with connection failure', async () => {
      mockPing.mockRejectedValue(new Error('Connection refused'));

      const health = await elasticClient.checkHealth();
      expect(health).toEqual({
        configured: true,
        status: 'disconnected'
      });
      expect(mockPing).toHaveBeenCalledTimes(1);
    });

    it('indexLog() adds ingestedAt and routes document to mocked Client.index', async () => {
      mockIndex.mockResolvedValue({ result: 'created' });

      const logEvent = {
        id: 'mock-evt-123',
        level: 'error',
        appName: 'frontend-shell',
        message: 'Mock log error'
      };

      const result = await elasticClient.indexLog(logEvent);
      expect(result).toEqual({ result: 'created' });
      expect(mockIndex).toHaveBeenCalledTimes(1);
      expect(mockIndex).toHaveBeenCalledWith({
        index: 'test-frontend-logs',
        document: expect.objectContaining({
          id: 'mock-evt-123',
          level: 'error',
          appName: 'frontend-shell',
          message: 'Mock log error',
          ingestedAt: expect.any(String)
        })
      });
    });

    it('indexLog() handles and propagates client authentication / permission failures', async () => {
      const authError = new Error('security_exception: [security_exception] unable to authenticate user');
      authError.status = 401;
      mockIndex.mockRejectedValue(authError);

      await expect(
        elasticClient.indexLog({ id: 'evt-fail', message: 'test' })
      ).rejects.toThrow('security_exception');
      expect(mockIndex).toHaveBeenCalledTimes(1);
    });

    it('indexLogsBulk() formats bulk operations array and routes to mocked Client.bulk', async () => {
      mockBulk.mockResolvedValue({ errors: false, items: [] });

      const events = [
        { id: 'bulk-1', level: 'info', message: 'Message 1' },
        { id: 'bulk-2', level: 'warn', message: 'Message 2' }
      ];

      const result = await elasticClient.indexLogsBulk(events);
      expect(result.errors).toBe(false);
      expect(mockBulk).toHaveBeenCalledTimes(1);
      expect(mockBulk).toHaveBeenCalledWith({
        operations: [
          { index: { _index: 'test-frontend-logs' } },
          expect.objectContaining({ id: 'bulk-1', message: 'Message 1', ingestedAt: expect.any(String) }),
          { index: { _index: 'test-frontend-logs' } },
          expect.objectContaining({ id: 'bulk-2', message: 'Message 2', ingestedAt: expect.any(String) })
        ]
      });
    });

    it('indexLogsBulk() throws ES_BULK_ERROR when bulk operations report errors', async () => {
      mockBulk.mockResolvedValue({
        errors: true,
        items: [
          {
            index: {
              error: {
                reason: 'mapper_parsing_exception'
              }
            }
          }
        ]
      });

      await expect(
        elasticClient.indexLogsBulk([{ id: 'bad-doc', message: 'bad' }])
      ).rejects.toMatchObject({
        code: 'ES_BULK_ERROR',
        message: 'mapper_parsing_exception'
      });
    });
  });

  describe('Dependency Injection via setClient()', () => {
    it('allows providing a custom mock client instance without env vars', async () => {
      delete process.env.ELASTICSEARCH_URL;
      delete process.env.ELASTIC_API_KEY;

      const customMock = {
        ping: jest.fn().mockResolvedValue(true),
        index: jest.fn().mockResolvedValue({ result: 'custom_created' }),
        bulk: jest.fn()
      };

      elasticClient.setClient(customMock);

      const health = await elasticClient.checkHealth();
      expect(health).toEqual({ configured: true, status: 'connected' });

      const res = await elasticClient.indexLog({ id: 'custom-1', message: 'custom' });
      expect(res.result).toBe('custom_created');
      expect(customMock.index).toHaveBeenCalled();
    });
  });

  describe('Automated Test Safeguard', () => {
    it('isMockConstructor identifies Jest mocked constructors', () => {
      expect(elasticClient.isMockConstructor(Client)).toBe(true);
      expect(elasticClient.isMockConstructor(function RealConstructor() {})).toBe(false);
      expect(elasticClient.isMockConstructor(null)).toBe(false);
    });

    it('prevents accidental live Client instantiation if constructor is not mocked in tests', () => {
      process.env.ELASTICSEARCH_URL = 'https://accidental-real.es.io:9243';
      process.env.ELASTIC_API_KEY = 'real-key';
      elasticClient.resetClient();

      const realUnmocked = class FakeRealClass {};
      expect(elasticClient.isMockConstructor(realUnmocked)).toBe(false);

      elasticClient.setClientConstructor(realUnmocked);
      expect(() => elasticClient.getClient()).toThrow(
        '[SAFEGUARD] Unintended real Elasticsearch connection prevented during automated tests.'
      );
    });

    it('checkHealth rethrows ES_TEST_SAFEGUARD when safeguard triggers', async () => {
      process.env.ELASTICSEARCH_URL = 'https://accidental-real.es.io:9243';
      process.env.ELASTIC_API_KEY = 'real-key';
      elasticClient.resetClient();

      class FakeRealClass {}
      elasticClient.setClientConstructor(FakeRealClass);

      await expect(elasticClient.checkHealth()).rejects.toMatchObject({
        code: 'ES_TEST_SAFEGUARD'
      });
    });
  });
});
