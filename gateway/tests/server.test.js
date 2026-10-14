const request = require('supertest');
const jwt = require('jsonwebtoken');

describe('API Gateway Tests', () => {
  let serverModule;
  const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

  beforeEach(() => {
    jest.clearAllMocks();
    serverModule = require('../src/server');
  });

  describe('Health Endpoint', () => {
    it('should return 200 with service details and configured services', async () => {
      const res = await request(serverModule.app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        service: 'gateway',
        ok: true,
        services: expect.objectContaining({
          user: expect.any(String),
          product: expect.any(String),
          order: expect.any(String),
          payment: expect.any(String),
        }),
      });
    });
  });

  describe('attachUser Middleware', () => {
    it('should proceed without setting user when authorization header is missing', () => {
      const req = { headers: {} };
      const res = {};
      const next = jest.fn();

      serverModule.attachUser(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should proceed without setting user when header does not start with Bearer', () => {
      const req = { headers: { authorization: 'Basic xyz123' } };
      const res = {};
      const next = jest.fn();

      serverModule.attachUser(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should attach decoded user to req when token is valid', () => {
      const payload = { id: 'user-123', email: 'test@example.com', role: 'customer' };
      const token = jwt.sign(payload, JWT_SECRET);

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = {};
      const next = jest.fn();

      serverModule.attachUser(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user-123');
      expect(req.user.email).toBe('test@example.com');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should set req.user to null when token is invalid or expired', () => {
      const req = { headers: { authorization: 'Bearer invalid.token.value' } };
      const res = {};
      const next = jest.fn();

      serverModule.attachUser(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('requireAuth Middleware', () => {
    it('should return 401 when req.user is missing', () => {
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      serverModule.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when req.user is null', () => {
      const req = { user: null };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      serverModule.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() when req.user is present', () => {
      const req = { user: { id: 'u1' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      serverModule.requireAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('proxyWithPrefix Utility', () => {
    it('should configure and return proxy middleware instance', () => {
      const proxy = serverModule.proxyWithPrefix('http://localhost:4001', '/api/auth');
      expect(typeof proxy).toBe('function');
    });
  });

  describe('Protected Routes Access Control', () => {
    it('should reject unauthenticated requests to /api/orders with 401', async () => {
      const res = await request(serverModule.app).get('/api/orders');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized' });
    });

    it('should reject requests to /api/orders with invalid token with 401', async () => {
      const res = await request(serverModule.app)
        .get('/api/orders')
        .set('Authorization', 'Bearer bad-token');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized' });
    });
  });

  describe('Observability & Telemetry Integration', () => {
    it('should attach x-correlation-id to responses', async () => {
      const res = await request(serverModule.app)
        .get('/health')
        .set('x-correlation-id', 'test-trace-gw-001');

      expect(res.status).toBe(200);
      expect(res.headers['x-correlation-id']).toBe('test-trace-gw-001');
    });

    it('should generate x-correlation-id if not provided', async () => {
      const res = await request(serverModule.app).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-correlation-id']).toBeDefined();
      expect(res.headers['x-correlation-id'].length).toBeGreaterThan(5);
    });

    it('should expose protected /swagger-stats/stats endpoint', async () => {
      const res = await request(serverModule.app).get('/swagger-stats/stats');
      // Requires auth, so 403 Forbidden is expected without credentials
      expect(res.status).toBe(403);
    });

    it('should have initialized structured logger with gateway name', () => {
      expect(serverModule.logger).toBeDefined();
      expect(serverModule.logger.serviceName).toBe('gateway');
    });
  });
});
