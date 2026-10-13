const Payment = require('../../src/models/Payment');

describe('Payment Service - Payment Model Schema Validation', () => {
  it('should validate a complete valid payment document', () => {
    const validPayment = new Payment({
      orderId: 'order-123',
      userId: 'user-456',
      amount: 1500,
      paymentMethod: 'mock-card',
      status: 'pending',
      transactionId: 'txn_001',
    });

    const err = validPayment.validateSync();
    expect(err).toBeUndefined();
    expect(validPayment.orderId).toBe('order-123');
    expect(validPayment.amount).toBe(1500);
  });

  it('should require orderId, userId, and amount', () => {
    const payment = new Payment({});
    const err = payment.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.orderId).toBeDefined();
    expect(err.errors.userId).toBeDefined();
    expect(err.errors.amount).toBeDefined();
  });

  it('should apply defaults for paymentMethod, status, and transactionId', () => {
    const payment = new Payment({
      orderId: 'o1',
      userId: 'u1',
      amount: 50,
    });
    expect(payment.paymentMethod).toBe('mock-card');
    expect(payment.status).toBe('pending');
    expect(payment.transactionId).toBe('');
  });

  it('should reject invalid status enum values', () => {
    const payment = new Payment({
      orderId: 'o1',
      userId: 'u1',
      amount: 50,
      status: 'refunded',
    });
    const err = payment.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.status).toBeDefined();
  });
});
