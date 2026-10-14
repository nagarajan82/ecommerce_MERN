const request = require('supertest');
const app = require('../src/app');
const elasticClient = require('../src/services/elasticClient');

jest.mock('../src/services/elasticClient', () => ({
  indexLog: jest.fn(),
  indexLogsBulk: jest.fn(),
  checkHealth: jest.fn()
}));

describe('Logs Route POST /api/logs', () => {
  const sampleEvent = {
    id: 'log-uuid-1',
    timestamp: '2026-10-14T12:00:00.000Z',
    level: 'error',
    category: 'runtime_error',
    appName: 'frontend-shell',
    environment: 'development',
    message: 'Failed to fetch catalog items',
    metadata: { statusCode: 500, endpoint: '/api/products' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('successfully ingests a single valid log event', async () => {
    elasticClient.indexLog.mockResolvedValue({ result: 'created' });

    const res = await request(app)
      .post('/api/logs')
      .set('Origin', 'http://localhost:3000')
      .send(sampleEvent);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      ingested: 1
    });
    expect(elasticClient.indexLog).toHaveBeenCalledTimes(1);
    expect(elasticClient.indexLog).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'log-uuid-1',
        appName: 'frontend-shell',
        level: 'error'
      })
    );
  });

  it('successfully ingests a bounded batch of log events', async () => {
    elasticClient.indexLogsBulk.mockResolvedValue({ errors: false, items: [{}, {}] });

    const batch = [
      sampleEvent,
      {
        id: 'log-uuid-2',
        timestamp: '2026-10-14T12:00:01.000Z',
        level: 'warn',
        category: 'performance',
        appName: 'catalog-mfe',
        environment: 'development',
        message: 'Slow render detected',
        metadata: { durationMs: 420 }
      }
    ];

    const res = await request(app)
      .post('/api/logs')
      .set('Origin', 'http://localhost:3002')
      .send(batch);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      ingested: 2
    });
    expect(elasticClient.indexLogsBulk).toHaveBeenCalledTimes(1);
    expect(elasticClient.indexLogsBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'log-uuid-1' }),
        expect.objectContaining({ id: 'log-uuid-2' })
      ])
    );
  });

  it('applies server-side redaction before passing documents to Elasticsearch', async () => {
    elasticClient.indexLog.mockResolvedValue({ result: 'created' });

    const unsanitizedEvent = {
      id: 'leak-test-1',
      timestamp: '2026-10-14T12:00:00.000Z',
      level: 'error',
      appName: 'auth-mfe',
      message: 'Failed auth for user customer@test.com with Bearer eyJhbGciOiJIUzI1NiJ9.abc.def',
      metadata: {
        password: 'PlainTextSecret',
        body: { creditCard: '4111-2222-3333-4444' }
      }
    };

    const res = await request(app)
      .post('/api/logs')
      .set('Origin', 'http://localhost:3001')
      .send(unsanitizedEvent);

    expect(res.status).toBe(201);
    expect(elasticClient.indexLog).toHaveBeenCalledTimes(1);

    const indexedDoc = elasticClient.indexLog.mock.calls[0][0];
    expect(indexedDoc.message).toContain('[REDACTED_EMAIL]');
    expect(indexedDoc.message).toContain('Bearer [REDACTED]');
    expect(indexedDoc.message).not.toContain('customer@test.com');
    expect(indexedDoc.message).not.toContain('eyJhbGci');
    expect(indexedDoc.metadata.password).toBe('[REDACTED]');
    expect(indexedDoc.metadata.body).toBe('[REDACTED_BODY]');
  });

  it('returns 503 when Elasticsearch storage fails', async () => {
    elasticClient.indexLog.mockRejectedValue(new Error('Connection refused to Elastic Cloud'));

    const res = await request(app)
      .post('/api/logs')
      .send(sampleEvent);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: 'Log storage backend unavailable',
      details: 'Failed to ingest log events into backend storage'
    });
    // Ensure sensitive details are not leaked
    expect(JSON.stringify(res.body)).not.toContain('Connection refused');
  });

  it('returns 400 when required fields are missing', async () => {
    const invalidEvent = {
      message: 'Missing id, timestamp, level, appName'
    };

    const res = await request(app)
      .post('/api/logs')
      .send(invalidEvent);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThanOrEqual(4);
    expect(elasticClient.indexLog).not.toHaveBeenCalled();
  });

  it('returns 400 when payload is an empty batch', async () => {
    const res = await request(app)
      .post('/api/logs')
      .send([]);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContain('Batch cannot be empty');
  });

  it('blocks origins not permitted by CORS policy', async () => {
    const res = await request(app)
      .post('/api/logs')
      .set('Origin', 'http://unauthorized-domain.com')
      .send(sampleEvent);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(elasticClient.indexLog).not.toHaveBeenCalled();
  });

  it('allows permitted origins and returns CORS headers', async () => {
    elasticClient.indexLog.mockResolvedValue({ result: 'created' });

    const res = await request(app)
      .post('/api/logs')
      .set('Origin', 'http://localhost:3000')
      .send(sampleEvent);

    expect(res.status).toBe(201);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('handles 404 for unknown endpoints', async () => {
    const res = await request(app).get('/api/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });
});
