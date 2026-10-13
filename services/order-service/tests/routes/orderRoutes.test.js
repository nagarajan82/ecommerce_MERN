const express = require('express');
const request = require('supertest');
const orderRoutes = require('../../src/routes/orderRoutes');
const orderController = require('../../src/controllers/orderController');

jest.mock('../../src/controllers/orderController', () => ({
  createOrder: jest.fn((req, res) => res.status(201).json({ id: 'ord-created' })),
  listMyOrders: jest.fn((req, res) => res.json([])),
}));

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: jest.fn((req, res, next) => {
    req.user = { id: 'test-user' };
    next();
  }),
}));

describe('Order Service - Order Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/orders', orderRoutes);
  });

  it('POST /api/orders routes to createOrder', async () => {
    const res = await request(app).post('/api/orders').send({ items: [] });
    expect(res.status).toBe(201);
    expect(orderController.createOrder).toHaveBeenCalled();
  });

  it('GET /api/orders routes to listMyOrders', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(200);
    expect(orderController.listMyOrders).toHaveBeenCalled();
  });

  it('GET /api/orders/mine routes to listMyOrders', async () => {
    const res = await request(app).get('/api/orders/mine');
    expect(res.status).toBe(200);
    expect(orderController.listMyOrders).toHaveBeenCalled();
  });
});
