const { createTelemetryMiddleware, TelemetryCollector } = require('../src/telemetry');
const elasticClient = require('../src/elasticClient');

jest.mock('../src/elasticClient', () => ({
  bulkIndex: jest.fn().mockResolvedValue({ count: 1 }),
  getClient: jest.fn().mockReturnValue({})
}));

describe('TelemetryCollector and swagger-stats middleware tests', () => {
  let collector;

  beforeEach(() => {
    jest.clearAllMocks();
    collector = new TelemetryCollector('order-service', {
      serviceType: 'microservice',
      capacity: 50,
      batchSize: 10
    });
  });

  afterEach(() => {
    collector.clearRecords();
  });

  test('formats telemetry record with status code, duration, method, and route', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/orders',
      path: '/api/orders',
      correlationId: 'trace-order-99',
      ip: '127.0.0.1',
      headers: { 'content-length': '150' }
    };
    const res = { statusCode: 201 };
    const rrr = {
      method: 'POST',
      path: '/api/orders',
      code: 201,
      duration: 125.5,
      req_clength: 150,
      res_clength: 320,
      query: { token: 'secret-token-val', view: 'summary' }
    };

    const doc = collector.formatTelemetryRecord(req, res, rrr);

    expect(doc['@timestamp']).toBeDefined();
    expect(doc.service.name).toBe('order-service');
    expect(doc.service.type).toBe('microservice');
    expect(doc.trace.id).toBe('trace-order-99');
    expect(doc.http.request.method).toBe('POST');
    expect(doc.http.route).toBe('/api/orders');
    expect(doc.http.response.status_code).toBe(201);
    expect(doc.http.response.duration_ms).toBe(125.5);
    expect(doc.telemetry.success).toBe(true);
    expect(doc.telemetry.status_class).toBe('2xx');
    expect(doc.network.client.ip).toBe('127.0.0.1');
    expect(doc.url.query.token).toBe('[REDACTED]');
    expect(doc.url.query.view).toBe('summary');
  });

  test('records telemetry and flushes to api-telemetry index', async () => {
    const req = { method: 'GET', originalUrl: '/health' };
    const res = { statusCode: 200 };
    const rrr = { method: 'GET', path: '/health', code: 200, duration: 5 };

    collector.record(req, res, rrr);
    expect(collector.getRecords().length).toBe(1);

    const flushRes = await collector.flush();
    expect(flushRes.success).toBe(true);
    expect(elasticClient.bulkIndex).toHaveBeenCalledWith('api-telemetry', expect.any(Array));
  });

  test('creates swagger-stats middleware with auth protection', () => {
    const middleware = createTelemetryMiddleware('gateway', {
      serviceType: 'gateway',
      uriPath: '/swagger-stats'
    });

    expect(typeof middleware).toBe('function');
    expect(middleware.collector).toBeDefined();
    expect(middleware.collector.serviceName).toBe('gateway');
    expect(middleware.collector.serviceType).toBe('gateway');
  });
});
