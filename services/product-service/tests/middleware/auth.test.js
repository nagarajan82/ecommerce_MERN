const jwt = require('jsonwebtoken');
const { requireAuth, requireAdmin } = require('../../src/middleware/auth');
const { jwtSecret } = require('../../src/config/env');

describe('Product Service - Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  describe('requireAuth', () => {
    it('should return 401 when authorization header is missing', () => {
      requireAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization does not start with Bearer ', () => {
      req.headers.authorization = 'Token 12345';
      requireAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 on invalid token verification failure', () => {
      req.headers.authorization = 'Bearer invalid.token';
      requireAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should attach user to req and call next on valid token', () => {
      const payload = { id: 'u1', role: 'admin' };
      const token = jwt.sign(payload, jwtSecret);
      req.headers.authorization = `Bearer ${token}`;

      requireAuth(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('u1');
      expect(req.user.role).toBe('admin');
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('requireAdmin', () => {
    it('should return 403 if req.user is undefined', () => {
      requireAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if req.user role is customer', () => {
      req.user = { id: 'u1', role: 'customer' };
      requireAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next if req.user role is admin', () => {
      req.user = { id: 'u1', role: 'admin' };
      requireAdmin(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
