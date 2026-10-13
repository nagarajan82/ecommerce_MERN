const { registerPaymentConsumer } = require('../../src/events/paymentConsumer');
const Order = require('../../src/models/Order');
const { publishEvent, subscribeEvent } = require('@repo/event-bus');

jest.mock('../../src/models/Order');
jest.mock('@repo/event-bus', () => ({
  publishEvent: jest.fn(),
  subscribeEvent: jest.fn(),
}));

describe('Order Service - Payment Consumer', () => {
  let mockChannel;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChannel = {};
  });

  it('should subscribe to payment.paid and payment.failed events', async () => {
    await registerPaymentConsumer(mockChannel);

    expect(subscribeEvent).toHaveBeenCalledWith(
      mockChannel,
      'order-service.payment-events',
      ['payment.paid', 'payment.failed'],
      expect.any(Function)
    );
  });

  it('should update order to paid and publish order.paid event on payment.paid', async () => {
    let capturedHandler;
    subscribeEvent.mockImplementation(async (ch, q, keys, handler) => {
      capturedHandler = handler;
    });

    await registerPaymentConsumer(mockChannel);

    const mockOrder = {
      _id: { toString: () => 'ord-1' },
      userId: 'user-1',
      items: [{ productId: 'p1', quantity: 1 }],
      totalAmount: 100,
      status: 'payment_pending',
      paymentStatus: 'pending',
      save: jest.fn().mockResolvedValue(),
    };
    Order.findById.mockResolvedValue(mockOrder);

    await capturedHandler({ orderId: 'ord-1' }, 'payment.paid');

    expect(Order.findById).toHaveBeenCalledWith('ord-1');
    expect(mockOrder.status).toBe('paid');
    expect(mockOrder.paymentStatus).toBe('paid');
    expect(mockOrder.save).toHaveBeenCalled();
    expect(publishEvent).toHaveBeenCalledWith(
      mockChannel,
      'order.paid',
      expect.objectContaining({
        orderId: 'ord-1',
        userId: 'user-1',
        totalAmount: 100,
      })
    );
  });

  it('should update order to payment_failed and publish order.payment_failed on payment.failed', async () => {
    let capturedHandler;
    subscribeEvent.mockImplementation(async (ch, q, keys, handler) => {
      capturedHandler = handler;
    });

    await registerPaymentConsumer(mockChannel);

    const mockOrder = {
      _id: { toString: () => 'ord-2' },
      userId: 'user-2',
      items: [],
      totalAmount: 50,
      status: 'payment_pending',
      paymentStatus: 'pending',
      save: jest.fn().mockResolvedValue(),
    };
    Order.findById.mockResolvedValue(mockOrder);

    await capturedHandler({ orderId: 'ord-2' }, 'payment.failed');

    expect(mockOrder.status).toBe('payment_failed');
    expect(mockOrder.paymentStatus).toBe('failed');
    expect(mockOrder.save).toHaveBeenCalled();
    expect(publishEvent).toHaveBeenCalledWith(
      mockChannel,
      'order.payment_failed',
      expect.objectContaining({
        orderId: 'ord-2',
        userId: 'user-2',
        totalAmount: 50,
      })
    );
  });

  it('should return early when order is not found', async () => {
    let capturedHandler;
    subscribeEvent.mockImplementation(async (ch, q, keys, handler) => {
      capturedHandler = handler;
    });

    await registerPaymentConsumer(mockChannel);
    Order.findById.mockResolvedValue(null);

    await capturedHandler({ orderId: 'nonexistent' }, 'payment.paid');

    expect(publishEvent).not.toHaveBeenCalled();
  });
});
