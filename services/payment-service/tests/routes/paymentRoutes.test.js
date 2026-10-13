const express = require('express');
const request = require('supertest');
const paymentRoutes = require('../../src/routes/paymentRoutes');
const paymentController = require('../../src/controllers/paymentController');

jest.mock('../../src/controllers/paymentController', () => ({
  processPayment: jest.fn((req, res) => res.status(202).json({ message: 'initiated' })),
  listPayments: jest.fn((req, res) => res.json([])),
}));

describe('Payment Service - Payment Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', paymentRoutes);
  });

  it('POST /api/payments/process routes to processPayment', async () => {
    const res = await request(app).post('/api/payments/process').send({ orderId: 'ord-1' });
    expect(res.status).toBe(202);
    expect(paymentController.processPayment).toHaveBeenCalled();
  });

  it('GET /api/payments routes to listPayments', async () => {
    const res = await request(app).get('/api/payments');
    expect(res.status).toBe(200);
    expect(paymentController.listPayments).toHaveBeenCalled();
  });
});
