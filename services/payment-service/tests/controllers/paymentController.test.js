const { processPayment, listPayments } = require('../../src/controllers/paymentController');
const Payment = require('../../src/models/Payment');
const { publishEvent } = require('@repo/event-bus');

jest.mock('../../src/models/Payment');
jest.mock('@repo/event-bus', () => ({
  publishEvent: jest.fn(),
}));

describe('Payment Service - Payment Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    req = {
      body: {},
      app: { locals: { channel: {} } },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('processPayment', () => {
    it('should create payment, return 202, and emit payment.paid on timer completion', async () => {
      req.body = {
        orderId: 'ord-101',
        userId: 'usr-1',
        amount: 2500,
        paymentMethod: 'mock-card',
      };

      const mockPayment = {
        _id: { toString: () => 'pay-123' },
        orderId: 'ord-101',
        userId: 'usr-1',
        amount: 2500,
        status: 'pending',
        save: jest.fn().mockResolvedValue(),
      };

      Payment.create.mockResolvedValue(mockPayment);

      await processPayment(req, res);

      expect(Payment.create).toHaveBeenCalledWith({
        orderId: 'ord-101',
        userId: 'usr-1',
        amount: 2500,
        paymentMethod: 'mock-card',
        status: 'pending',
      });

      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Payment initiated',
        paymentId: mockPayment._id,
        status: 'pending',
      });

      // Fast-forward timer to execute async settlement
      await jest.advanceTimersByTimeAsync(1500);

      expect(mockPayment.status).toBe('paid');
      expect(mockPayment.transactionId).toMatch(/^txn_\d+/);
      expect(mockPayment.save).toHaveBeenCalled();
      expect(publishEvent).toHaveBeenCalledWith(
        req.app.locals.channel,
        'payment.paid',
        expect.objectContaining({
          paymentId: 'pay-123',
          orderId: 'ord-101',
          userId: 'usr-1',
          amount: 2500,
          transactionId: mockPayment.transactionId,
        })
      );
    });

    it('should emit payment.failed if async save fails during settlement', async () => {
      req.body = {
        orderId: 'ord-102',
        userId: 'usr-2',
        amount: 1000,
      };

      const mockPayment = {
        _id: { toString: () => 'pay-456' },
        save: jest.fn().mockRejectedValue(new Error('Write concern error')),
      };

      Payment.create.mockResolvedValue(mockPayment);

      await processPayment(req, res);
      expect(res.status).toHaveBeenCalledWith(202);

      await jest.advanceTimersByTimeAsync(1500);

      expect(publishEvent).toHaveBeenCalledWith(
        req.app.locals.channel,
        'payment.failed',
        {
          paymentId: 'pay-456',
          orderId: 'ord-102',
          userId: 'usr-2',
          amount: 1000,
        }
      );
    });

    it('should return 500 when synchronous Payment.create throws', async () => {
      req.body = { orderId: 'ord-fail' };
      Payment.create.mockRejectedValue(new Error('Database disconnected'));

      await processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Database disconnected' });
    });
  });

  describe('listPayments', () => {
    it('should return all payments sorted by createdAt descending', async () => {
      const mockList = [{ _id: 'pay-1', amount: 500 }];
      const sortMock = jest.fn().mockResolvedValue(mockList);
      Payment.find.mockReturnValue({ sort: sortMock });

      await listPayments(req, res);

      expect(Payment.find).toHaveBeenCalled();
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(res.json).toHaveBeenCalledWith(mockList);
    });

    it('should return 500 on database failure', async () => {
      Payment.find.mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('Query error')),
      });

      await listPayments(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Query error' });
    });
  });
});
