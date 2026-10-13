const axios = require('axios');
const { createOrder, listMyOrders } = require('../../src/controllers/orderController');
const Order = require('../../src/models/Order');
const { publishEvent } = require('@repo/event-bus');

jest.mock('axios');
jest.mock('../../src/models/Order');
jest.mock('@repo/event-bus', () => ({
  publishEvent: jest.fn(),
}));

describe('Order Service - Order Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { id: 'user-1' },
      body: {},
      app: { locals: { channel: {} } },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('createOrder', () => {
    it('should return 400 when items is not an array or is empty', async () => {
      req.body = { items: [] };
      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'At least one order item is required' });

      req.body = { items: null };
      await createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when a product is invalid/not returned by product-service', async () => {
      req.body = {
        items: [{ productId: 'p1', quantity: 1 }],
      };
      axios.get.mockResolvedValue({ data: [] }); // product-service returned empty list

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid product: p1' });
    });

    it('should return 400 when product stock is insufficient', async () => {
      req.body = {
        items: [{ productId: 'p1', quantity: 5 }],
      };
      axios.get.mockResolvedValue({
        data: [{ _id: 'p1', name: 'Keyboard', price: 100, stock: 2 }],
      });

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Insufficient stock for Keyboard' });
    });

    it('should create order, publish order.created event, and call payment-service process', async () => {
      req.body = {
        items: [
          { productId: 'p1', quantity: 2 },
          { productId: 'p2', quantity: 1 },
        ],
        shippingAddress: { fullName: 'Alice' },
      };

      axios.get.mockResolvedValue({
        data: [
          { _id: 'p1', name: 'Keyboard', price: 50, stock: 10 },
          { _id: 'p2', name: 'Mouse', price: 30, stock: 5 },
        ],
      });

      const mockCreatedOrder = {
        _id: { toString: () => 'ord-123' },
        userId: 'user-1',
        totalAmount: 130, // 50*2 + 30*1
        status: 'payment_pending',
        paymentStatus: 'pending',
      };
      Order.create.mockResolvedValue(mockCreatedOrder);
      axios.post.mockResolvedValue({ data: { success: true } });

      await createOrder(req, res);

      expect(Order.create).toHaveBeenCalledWith({
        userId: 'user-1',
        items: [
          { productId: 'p1', name: 'Keyboard', price: 50, quantity: 2 },
          { productId: 'p2', name: 'Mouse', price: 30, quantity: 1 },
        ],
        shippingAddress: { fullName: 'Alice' },
        totalAmount: 130,
        status: 'payment_pending',
        paymentStatus: 'pending',
      });

      expect(publishEvent).toHaveBeenCalledWith(
        req.app.locals.channel,
        'order.created',
        expect.objectContaining({
          orderId: 'ord-123',
          userId: 'user-1',
          totalAmount: 130,
        })
      );

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/payments/process'),
        {
          orderId: mockCreatedOrder._id,
          userId: 'user-1',
          amount: 130,
          paymentMethod: 'mock-card',
        }
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockCreatedOrder);
    });

    it('should handle axios or database errors with 500 status', async () => {
      req.body = { items: [{ productId: 'p1', quantity: 1 }] };
      const axiosError = new Error('Gateway Timeout');
      axiosError.response = { data: { message: 'Product service unreachable' } };
      axios.get.mockRejectedValue(axiosError);

      await createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Product service unreachable' });
    });
  });

  describe('listMyOrders', () => {
    it('should return user orders sorted by createdAt descending', async () => {
      const mockOrders = [{ _id: 'o1', totalAmount: 100 }];
      const sortMock = jest.fn().mockResolvedValue(mockOrders);
      Order.find.mockReturnValue({ sort: sortMock });

      await listMyOrders(req, res);

      expect(Order.find).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(res.json).toHaveBeenCalledWith(mockOrders);
    });

    it('should return 500 on database failure', async () => {
      Order.find.mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('DB failure')),
      });

      await listMyOrders(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'DB failure' });
    });
  });
});
