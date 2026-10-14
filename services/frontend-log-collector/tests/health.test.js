const request = require('supertest');
const app = require('../src/app');
const elasticClient = require('../src/services/elasticClient');

jest.mock('../src/services/elasticClient', () => ({
  checkHealth: jest.fn(),
  indexLog: jest.fn(),
  indexLogsBulk: jest.fn()
}));

describe('Health Route GET /health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 and reports unconfigured when Elasticsearch credentials are missing', async () => {
    elasticClient.checkHealth.mockResolvedValue({
      configured: false,
      status: 'unconfigured'
    });

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'frontend-log-collector',
      elasticsearch: {
        configured: false,
        status: 'unconfigured'
      }
    });
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('returns 200 and reports connected when Elasticsearch is reachable', async () => {
    elasticClient.checkHealth.mockResolvedValue({
      configured: true,
      status: 'connected'
    });

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.elasticsearch).toEqual({
      configured: true,
      status: 'connected'
    });
  });

  it('never leaks secret environment variables or credentials in health output', async () => {
    elasticClient.checkHealth.mockResolvedValue({
      configured: true,
      status: 'connected'
    });

    const res = await request(app).get('/health');
    const raw = JSON.stringify(res.body);

    expect(raw).not.toContain('apiKey');
    expect(raw).not.toContain('elasticApiKey');
    expect(raw).not.toContain('password');
    expect(raw).not.toContain('secret');
  });

  it('handles unexpected exceptions in health check gracefully', async () => {
    elasticClient.checkHealth.mockRejectedValue(new Error('Internal failure'));

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.elasticsearch).toEqual({
      configured: false,
      status: 'error'
    });
  });
});
