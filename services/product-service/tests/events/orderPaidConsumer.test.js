const { registerOrderPaidConsumer } = require('../../src/events/orderPaidConsumer');
const Product = require('../../src/models/Product');
const { subscribeEvent } = require('@repo/event-bus');

jest.mock('../../src/models/Product');
jest.mock('@repo/event-bus', () => ({
  subscribeEvent: jest.fn(),
}));

describe('Product Service - Order Paid Consumer', () => {
  let mockChannel;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChannel = {};
  });

  it('should subscribe to order.paid event on the correct queue', async () => {
    await registerOrderPaidConsumer(mockChannel);

    expect(subscribeEvent).toHaveBeenCalledWith(
      mockChannel,
      'product-service.order-events',
      ['order.paid'],
      expect.any(Function)
    );
  });

  it('should decrement product stock when order.paid event is processed', async () => {
    let capturedHandler;
    subscribeEvent.mockImplementation(async (ch, q, keys, handler) => {
      capturedHandler = handler;
    });

    await registerOrderPaidConsumer(mockChannel);
    expect(capturedHandler).toBeDefined();

    const payload = {
      orderId: 'order-101',
      items: [
        { productId: 'prod-1', quantity: 2 },
        { productId: 'prod-2', quantity: 1 },
      ],
    };

    Product.findByIdAndUpdate.mockResolvedValue({});

    await capturedHandler(payload, 'order.paid');

    expect(Product.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith('prod-1', {
      $inc: { stock: -2 },
    });
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith('prod-2', {
      $inc: { stock: -1 },
    });
  });

  it('should ignore events with routingKey other than order.paid', async () => {
    let capturedHandler;
    subscribeEvent.mockImplementation(async (ch, q, keys, handler) => {
      capturedHandler = handler;
    });

    await registerOrderPaidConsumer(mockChannel);

    await capturedHandler({ items: [{ productId: 'p1', quantity: 1 }] }, 'order.created');

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('should handle payload with missing or empty items gracefully', async () => {
    let capturedHandler;
    subscribeEvent.mockImplementation(async (ch, q, keys, handler) => {
      capturedHandler = handler;
    });

    await registerOrderPaidConsumer(mockChannel);

    await capturedHandler({ orderId: 'ord-empty' }, 'order.paid');

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
