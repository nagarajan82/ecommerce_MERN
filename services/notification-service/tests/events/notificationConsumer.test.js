const { registerNotificationConsumer } = require('../../src/events/notificationConsumer');
const Notification = require('../../src/models/Notification');
const { subscribeEvent } = require('@repo/event-bus');

jest.mock('../../src/models/Notification');
jest.mock('@repo/event-bus', () => ({
  subscribeEvent: jest.fn(),
}));

describe('Notification Service - Notification Consumer', () => {
  let mockChannel, capturedHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChannel = {};
    subscribeEvent.mockImplementation(async (ch, q, keys, handler) => {
      capturedHandler = handler;
    });
  });

  it('should register subscription for all 5 event types', async () => {
    await registerNotificationConsumer(mockChannel);

    expect(subscribeEvent).toHaveBeenCalledWith(
      mockChannel,
      'notification-service.events',
      [
        'payment.paid',
        'payment.failed',
        'order.paid',
        'order.payment_failed',
        'user.registered',
      ],
      expect.any(Function)
    );
  });

  it('should format and store user.registered event', async () => {
    await registerNotificationConsumer(mockChannel);

    const payload = { name: 'Alice', email: 'alice@example.com' };
    await capturedHandler(payload, 'user.registered');

    expect(Notification.create).toHaveBeenCalledWith({
      title: 'User Registered',
      message: 'New user registered: Alice (alice@example.com)',
      eventType: 'user.registered',
      payload,
    });
  });

  it('should format and store payment.paid event', async () => {
    await registerNotificationConsumer(mockChannel);

    const payload = { orderId: 'ord-101' };
    await capturedHandler(payload, 'payment.paid');

    expect(Notification.create).toHaveBeenCalledWith({
      title: 'Payment Successful',
      message: 'Payment completed for order ord-101',
      eventType: 'payment.paid',
      payload,
    });
  });

  it('should format and store payment.failed event', async () => {
    await registerNotificationConsumer(mockChannel);

    const payload = { orderId: 'ord-102' };
    await capturedHandler(payload, 'payment.failed');

    expect(Notification.create).toHaveBeenCalledWith({
      title: 'Payment Failed',
      message: 'Payment failed for order ord-102',
      eventType: 'payment.failed',
      payload,
    });
  });

  it('should format and store order.paid event', async () => {
    await registerNotificationConsumer(mockChannel);

    const payload = { orderId: 'ord-103' };
    await capturedHandler(payload, 'order.paid');

    expect(Notification.create).toHaveBeenCalledWith({
      title: 'Order Paid',
      message: 'Order ord-103 has been marked as paid',
      eventType: 'order.paid',
      payload,
    });
  });

  it('should format and store order.payment_failed event', async () => {
    await registerNotificationConsumer(mockChannel);

    const payload = { orderId: 'ord-104' };
    await capturedHandler(payload, 'order.payment_failed');

    expect(Notification.create).toHaveBeenCalledWith({
      title: 'Order Payment Failed',
      message: 'Order ord-104 payment failed',
      eventType: 'order.payment_failed',
      payload,
    });
  });

  it('should handle unhandled/default event types gracefully', async () => {
    await registerNotificationConsumer(mockChannel);

    const payload = { foo: 'bar' };
    await capturedHandler(payload, 'custom.event');

    expect(Notification.create).toHaveBeenCalledWith({
      title: 'System Event',
      message: 'Received event custom.event',
      eventType: 'custom.event',
      payload,
    });
  });
});
