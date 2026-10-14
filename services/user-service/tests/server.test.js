jest.mock('@repo/event-bus', () => ({
  connectRabbit: jest.fn().mockResolvedValue({ channel: {} }),
  publishEvent: jest.fn()
}));
jest.mock('../src/config/db', () => ({
  connectDB: jest.fn().mockResolvedValue(true)
}));

const { logger } = require('../src/server');

describe('User Service Observability Integration', () => {
  beforeAll(async () => {
    // Allow background module loading in swagger-stats to settle before teardown
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  test('logger is initialized with service name user-service', () => {
    expect(logger).toBeDefined();
    expect(logger.serviceName).toBe('user-service');
  });

  test('formats user-service operational log event', () => {
    const event = logger.info('Test operational event in user-service', {
      correlationId: 'test-trace-usr-01',
      userId: 'usr-123'
    });

    expect(event['@timestamp']).toBeDefined();
    expect(event.service.name).toBe('user-service');
    expect(event.trace.id).toBe('test-trace-usr-01');
    expect(event.labels.userId).toBe('usr-123');
  });
});
