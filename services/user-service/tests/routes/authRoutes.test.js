const express = require('express');
const request = require('supertest');
const authRoutes = require('../../src/routes/authRoutes');
const authController = require('../../src/controllers/authController');

jest.mock('../../src/controllers/authController', () => ({
  register: jest.fn((req, res) => res.status(201).json({ success: true, route: 'register' })),
  login: jest.fn((req, res) => res.status(200).json({ success: true, route: 'login' })),
  profile: jest.fn((req, res) => res.status(200).json({ success: true, route: 'profile' })),
}));

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: jest.fn((req, res, next) => next()),
  requireAdmin: jest.fn((req, res, next) => next()),
}));

describe('User Service - Auth Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
  });

  it('POST /api/auth/register routes to register controller', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'test@example.com' });
    expect(res.status).toBe(201);
    expect(authController.register).toHaveBeenCalled();
  });

  it('POST /api/auth/login routes to login controller', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'test@example.com' });
    expect(res.status).toBe(200);
    expect(authController.login).toHaveBeenCalled();
  });

  it('GET /api/auth/me routes through requireAuth to profile controller', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(authController.profile).toHaveBeenCalled();
  });
});
