jest.mock('@repo/event-bus', () => ({
  connectRabbit: jest.fn().mockResolvedValue({ channel: {} }),
  publishEvent: jest.fn()
}));
jest.mock('../src/config/db', () => ({
  connectDB: jest.fn().mockResolvedValue(true)
}));
jest.mock('../src/events/paymentConsumer', () => ({
  registerPaymentConsumer: jest.fn().mockResolvedValue(true)
}));

const { logger } = require('../src/server');

describe('Order Service Observability Integration', () => {
  beforeAll(async () => {
    // Allow background module loading in swagger-stats to settle before teardown
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  test('logger is initialized with service name order-service', () => {
    expect(logger).toBeDefined();
    expect(logger.serviceName).toBe('order-service');
  });

  test('formats order-service operational log event', () => {
    const event = logger.info('Test operational event in order-service', {
      correlationId: 'test-trace-ord-01',
      orderId: 'ord-789'
    });

    expect(event['@timestamp']).toBeDefined();
    expect(event.service.name).toBe('order-service');
    expect(event.trace.id).toBe('test-trace-ord-01');
    expect(event.labels.orderId).toBe('ord-789');
  });
});
