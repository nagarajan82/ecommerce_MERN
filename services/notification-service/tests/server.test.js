jest.mock('@repo/event-bus', () => ({
  connectRabbit: jest.fn().mockResolvedValue({ channel: {} }),
  publishEvent: jest.fn()
}));
jest.mock('../src/config/db', () => ({
  connectDB: jest.fn().mockResolvedValue(true)
}));
jest.mock('../src/events/notificationConsumer', () => ({
  registerNotificationConsumer: jest.fn().mockResolvedValue(true)
}));

const { logger } = require('../src/server');

describe('Notification Service Observability Integration', () => {
  beforeAll(async () => {
    // Allow background module loading in swagger-stats to settle before teardown
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  test('logger is initialized with service name notification-service', () => {
    expect(logger).toBeDefined();
    expect(logger.serviceName).toBe('notification-service');
  });

  test('formats notification-service operational log event', () => {
    const event = logger.info('Test operational event in notification-service', {
      correlationId: 'test-trace-notif-01',
      notificationId: 'notif-789'
    });

    expect(event['@timestamp']).toBeDefined();
    expect(event.service.name).toBe('notification-service');
    expect(event.trace.id).toBe('test-trace-notif-01');
    expect(event.labels.notificationId).toBe('notif-789');
  });
});
