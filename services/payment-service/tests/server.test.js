jest.mock('@repo/event-bus', () => ({
  connectRabbit: jest.fn().mockResolvedValue({ channel: {} }),
  publishEvent: jest.fn()
}));
jest.mock('../src/config/db', () => ({
  connectDB: jest.fn().mockResolvedValue(true)
}));

const { logger } = require('../src/server');

describe('Payment Service Observability Integration', () => {
  beforeAll(async () => {
    // Allow background module loading in swagger-stats to settle before teardown
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  test('logger is initialized with service name payment-service', () => {
    expect(logger).toBeDefined();
    expect(logger.serviceName).toBe('payment-service');
  });

  test('formats payment-service operational log event', () => {
    const event = logger.info('Test operational event in payment-service', {
      correlationId: 'test-trace-pay-01',
      paymentId: 'pay-789'
    });

    expect(event['@timestamp']).toBeDefined();
    expect(event.service.name).toBe('payment-service');
    expect(event.trace.id).toBe('test-trace-pay-01');
    expect(event.labels.paymentId).toBe('pay-789');
  });
});
