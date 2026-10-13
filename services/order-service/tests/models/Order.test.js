const mongoose = require('mongoose');
const Order = require('../../src/models/Order');

describe('Order Service - Order Model Schema Validation', () => {
  it('should validate a complete valid order document', () => {
    const validOrder = new Order({
      userId: 'user-123',
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          name: 'Keyboard',
          price: 5000,
          quantity: 1,
        },
      ],
      shippingAddress: {
        fullName: 'Alice Smith',
        line1: '123 Main St',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      },
      totalAmount: 5000,
      status: 'payment_pending',
      paymentStatus: 'pending',
    });

    const err = validOrder.validateSync();
    expect(err).toBeUndefined();
    expect(validOrder.status).toBe('payment_pending');
    expect(validOrder.paymentStatus).toBe('pending');
  });

  it('should require userId and totalAmount', () => {
    const invalidOrder = new Order({});
    const err = invalidOrder.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.userId).toBeDefined();
    expect(err.errors.totalAmount).toBeDefined();
  });

  it('should require productId, name, price, and quantity for items', () => {
    const order = new Order({
      userId: 'u1',
      totalAmount: 100,
      items: [{}],
    });
    const err = order.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['items.0.productId']).toBeDefined();
    expect(err.errors['items.0.name']).toBeDefined();
    expect(err.errors['items.0.price']).toBeDefined();
    expect(err.errors['items.0.quantity']).toBeDefined();
  });

  it('should default status to created and paymentStatus to pending', () => {
    const order = new Order({
      userId: 'u1',
      totalAmount: 200,
    });
    expect(order.status).toBe('created');
    expect(order.paymentStatus).toBe('pending');
  });

  it('should reject invalid status or paymentStatus enum values', () => {
    const order = new Order({
      userId: 'u1',
      totalAmount: 100,
      status: 'invalid_status',
      paymentStatus: 'invalid_payment',
    });
    const err = order.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.status).toBeDefined();
    expect(err.errors.paymentStatus).toBeDefined();
  });
});
