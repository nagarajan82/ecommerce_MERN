const jwt = require('jsonwebtoken');
const { requireAuth } = require('../../src/middleware/auth');
const { jwtSecret } = require('../../src/config/env');

describe('Order Service - Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  it('should return 401 when authorization header is missing', () => {
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization does not start with Bearer ', () => {
    req.headers.authorization = 'Basic token123';
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 on invalid token verification failure', () => {
    req.headers.authorization = 'Bearer bad.token.here';
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should attach decoded user to req and call next when token is valid', () => {
    const payload = { id: 'u1', email: 'test@example.com' };
    const token = jwt.sign(payload, jwtSecret);
    req.headers.authorization = `Bearer ${token}`;

    requireAuth(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('u1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  describe('requireAdmin', () => {
    const { requireAdmin } = require('../../src/middleware/auth');

    it('should return 403 when req.user is missing', () => {
      requireAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when req.user role is not admin', () => {
      req.user = { id: 'u1', role: 'customer' };
      requireAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next when req.user role is admin', () => {
      req.user = { id: 'u1', role: 'admin' };
      requireAdmin(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
