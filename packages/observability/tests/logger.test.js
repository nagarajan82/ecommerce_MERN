const { createLogger, StructuredLogger } = require('../src/logger');
const elasticClient = require('../src/elasticClient');

jest.mock('../src/elasticClient', () => ({
  bulkIndex: jest.fn().mockResolvedValue({ count: 1 }),
  getClient: jest.fn().mockReturnValue({})
}));

describe('StructuredLogger Unit Tests', () => {
  let logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new StructuredLogger('test-service', {
      capacity: 50,
      batchSize: 10,
      flushIntervalMs: 5000
    });
  });

  afterEach(() => {
    logger.clearLogs();
  });

  test('formats log event with ECS-compatible fields and service name', () => {
    const event = logger.info('Test info message', {
      correlationId: 'corr-12345',
      method: 'GET',
      path: '/api/test',
      status: 200,
      customKey: 'customVal'
    });

    expect(event['@timestamp']).toBeDefined();
    expect(event.service.name).toBe('test-service');
    expect(event.service.version).toBe('1.0.0');
    expect(event.log.level).toBe('info');
    expect(event.message).toBe('Test info message');
    expect(event.trace.id).toBe('corr-12345');
    expect(event.http.request.method).toBe('GET');
    expect(event.http.response.status_code).toBe(200);
    expect(event.url.path).toBe('/api/test');
    expect(event.labels.customKey).toBe('customVal');
  });

  test('captures Error objects with type, message, and sanitized stack trace', () => {
    const error = new TypeError('Cannot read properties of null');
    const event = logger.error('Operation failed', error);

    expect(event.log.level).toBe('error');
    expect(event.message).toBe('Operation failed');
    expect(event.error.type).toBe('TypeError');
    expect(event.error.message).toBe('Cannot read properties of null');
    expect(event.error.stack_trace).toBeDefined();
  });

  test('redacts sensitive data: passwords, tokens, cookies, auth headers', () => {
    const event = logger.warn('User login warning Bearer secret_token_xyz123', {
      password: 'PlainPassword999',
      token: 'jwt_abc.def.ghi',
      auth: 'secretAuth',
      cookie: 'session=xyz',
      safeData: 'visible'
    });

    expect(event.message).toContain('Bearer [REDACTED]');
    expect(event.labels.password).toBe('[REDACTED]');
    expect(event.labels.token).toBe('[REDACTED]');
    expect(event.labels.auth).toBe('[REDACTED]');
    expect(event.labels.cookie).toBe('[REDACTED]');
    expect(event.labels.safeData).toBe('visible');
  });

  test('maintains bounded circular buffer capacity', () => {
    const smallLogger = new StructuredLogger('small-service', { capacity: 5 });
    for (let i = 1; i <= 10; i++) {
      smallLogger.info(`Msg ${i}`);
    }

    const logs = smallLogger.getLogs();
    expect(logs.length).toBe(5);
    expect(logs[0].message).toBe('Msg 6');
    expect(logs[4].message).toBe('Msg 10');
  });

  test('flushes batch to bulkIndex on error level or manual flush', async () => {
    logger.info('Msg 1');
    logger.info('Msg 2');
    expect(elasticClient.bulkIndex).not.toHaveBeenCalled();

    const res = await logger.flush();
    expect(res.success).toBe(true);
    expect(res.count).toBe(2);
    expect(elasticClient.bulkIndex).toHaveBeenCalledTimes(1);
    expect(elasticClient.bulkIndex).toHaveBeenCalledWith('backend-logs', expect.any(Array));
  });

  test('handles bulkIndex failure gracefully with backoff and retry drops', async () => {
    elasticClient.bulkIndex.mockRejectedValue(new Error('ES Connection Refused'));

    logger.info('Failed batch item');
    const res = await logger.flush();

    expect(res.success).toBe(false);
    expect(res.error).toBe('ES Connection Refused');
    expect(logger.retryCount).toBe(1);

    // Simulate exceeding max retries
    logger.retryCount = 3;
    await logger.flush();
    expect(logger.queue.length).toBe(0); // dropped to prevent unbounded growth
    expect(logger.retryCount).toBe(0);
  });
});
