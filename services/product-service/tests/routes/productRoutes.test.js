const express = require('express');
const request = require('supertest');
const productRoutes = require('../../src/routes/productRoutes');
const productController = require('../../src/controllers/productController');

jest.mock('../../src/controllers/productController', () => ({
  listProducts: jest.fn((req, res) => res.json([])),
  getProduct: jest.fn((req, res) => res.json({ id: req.params.id })),
  createProduct: jest.fn((req, res) => res.status(201).json(req.body)),
  seedProducts: jest.fn((req, res) => res.json({ message: 'seeded' })),
  getProductsByIds: jest.fn((req, res) => res.json([])),
}));

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: jest.fn((req, res, next) => next()),
  requireAdmin: jest.fn((req, res, next) => next()),
}));

describe('Product Service - Product Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/products', productRoutes);
  });

  it('GET /api/products routes to listProducts', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(productController.listProducts).toHaveBeenCalled();
  });

  it('GET /api/products/batch routes to getProductsByIds', async () => {
    const res = await request(app).get('/api/products/batch?ids=p1,p2');
    expect(res.status).toBe(200);
    expect(productController.getProductsByIds).toHaveBeenCalled();
  });

  it('GET /api/products/:id routes to getProduct', async () => {
    const res = await request(app).get('/api/products/123');
    expect(res.status).toBe(200);
    expect(productController.getProduct).toHaveBeenCalled();
  });

  it('POST /api/products routes through auth to createProduct', async () => {
    const res = await request(app).post('/api/products').send({ name: 'Item' });
    expect(res.status).toBe(201);
    expect(productController.createProduct).toHaveBeenCalled();
  });

  it('POST /api/products/seed routes to seedProducts', async () => {
    const res = await request(app).post('/api/products/seed');
    expect(res.status).toBe(200);
    expect(productController.seedProducts).toHaveBeenCalled();
  });
});
