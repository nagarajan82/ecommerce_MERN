jest.mock('@repo/event-bus', () => ({
  connectRabbit: jest.fn().mockResolvedValue({ channel: {} }),
  publishEvent: jest.fn()
}));
jest.mock('../src/config/db', () => ({
  connectDB: jest.fn().mockResolvedValue(true)
}));

const { logger } = require('../src/server');

describe('Product Service Observability Integration', () => {
  beforeAll(async () => {
    // Allow background module loading in swagger-stats to settle before teardown
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  test('logger is initialized with service name product-service', () => {
    expect(logger).toBeDefined();
    expect(logger.serviceName).toBe('product-service');
  });

  test('formats product-service operational log event', () => {
    const event = logger.info('Test operational event in product-service', {
      correlationId: 'test-trace-prod-01',
      productId: 'prod-456'
    });

    expect(event['@timestamp']).toBeDefined();
    expect(event.service.name).toBe('product-service');
    expect(event.trace.id).toBe('test-trace-prod-01');
    expect(event.labels.productId).toBe('prod-456');
  });
});
