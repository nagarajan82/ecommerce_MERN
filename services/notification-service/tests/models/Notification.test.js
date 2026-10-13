const Notification = require('../../src/models/Notification');

describe('Notification Service - Notification Model Schema Validation', () => {
  it('should validate a complete valid notification document', () => {
    const validNotification = new Notification({
      eventType: 'order.paid',
      recipient: 'user@example.com',
      title: 'Order Paid',
      message: 'Your order has been paid',
      payload: { orderId: 'ord-123' },
    });

    const err = validNotification.validateSync();
    expect(err).toBeUndefined();
    expect(validNotification.eventType).toBe('order.paid');
    expect(validNotification.title).toBe('Order Paid');
  });

  it('should require eventType, title, and message', () => {
    const invalidNotification = new Notification({});
    const err = invalidNotification.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.eventType).toBeDefined();
    expect(err.errors.title).toBeDefined();
    expect(err.errors.message).toBeDefined();
  });

  it('should default recipient to empty string and payload to empty object', () => {
    const notification = new Notification({
      eventType: 'system.ping',
      title: 'Ping',
      message: 'Ping event',
    });

    expect(notification.recipient).toBe('');
    expect(notification.payload).toEqual({});
  });
});
