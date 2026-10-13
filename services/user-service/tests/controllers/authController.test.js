const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { register, login, profile } = require('../../src/controllers/authController');
const User = require('../../src/models/User');
const { publishEvent } = require('@repo/event-bus');

jest.mock('../../src/models/User');
jest.mock('bcryptjs');
jest.mock('@repo/event-bus', () => ({
  publishEvent: jest.fn(),
}));

describe('User Service - Auth Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      app: { locals: {} },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('register', () => {
    it('should return 400 if required fields are missing or empty', async () => {
      req.body = { name: '', email: 'test@example.com', password: 'secret' };
      await register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'name, email, password are required' });

      req.body = { name: 'Alice', email: '', password: 'secret' };
      await register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.body = { name: 'Alice', email: 'alice@example.com', password: '' };
      await register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.body = { name: 123, email: 'alice@example.com', password: 'secret' };
      await register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 409 if user with email already exists', async () => {
      req.body = { name: 'Alice', email: 'Alice@example.com', password: 'secret' };
      User.findOne.mockResolvedValue({ _id: 'u1', email: 'alice@example.com' });

      await register(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'alice@example.com' });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: 'User already exists' });
    });

    it('should register a new user successfully and publish event when channel exists', async () => {
      const mockChannel = { publish: jest.fn() };
      req.app.locals.channel = mockChannel;
      req.body = { name: '  Alice  ', email: ' ALICE@Example.com ', password: 'password123' };

      User.findOne.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashedPassword');
      const createdUser = {
        _id: { toString: () => 'user-123' },
        name: 'Alice',
        email: 'alice@example.com',
        role: 'customer',
      };
      User.create.mockResolvedValue(createdUser);

      await register(req, res);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(User.create).toHaveBeenCalledWith({
        name: 'Alice',
        email: 'alice@example.com',
        passwordHash: 'hashedPassword',
      });
      expect(publishEvent).toHaveBeenCalledWith(mockChannel, 'user.registered', {
        userId: 'user-123',
        email: 'alice@example.com',
        name: 'Alice',
        role: 'customer',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        token: expect.any(String),
        user: {
          id: createdUser._id,
          name: 'Alice',
          email: 'alice@example.com',
          role: 'customer',
        },
      });
    });

    it('should register successfully even when no channel is configured', async () => {
      req.app.locals.channel = null;
      req.body = { name: 'Bob', email: 'bob@example.com', password: 'password123' };

      User.findOne.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashedPassword');
      const createdUser = {
        _id: { toString: () => 'user-456' },
        name: 'Bob',
        email: 'bob@example.com',
        role: 'customer',
      };
      User.create.mockResolvedValue(createdUser);

      await register(req, res);

      expect(publishEvent).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 409 if duplicate key error 11000 is thrown during creation', async () => {
      req.body = { name: 'Alice', email: 'alice@example.com', password: 'secret' };
      User.findOne.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hash');
      const mongoError = new Error('Duplicate key error');
      mongoError.code = 11000;
      User.create.mockRejectedValue(mongoError);

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: 'User already exists' });
    });

    it('should return 500 on unexpected errors', async () => {
      req.body = { name: 'Alice', email: 'alice@example.com', password: 'secret' };
      User.findOne.mockRejectedValue(new Error('DB failure'));

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'DB failure' });
    });
  });

  describe('login', () => {
    it('should return 401 if user is not found', async () => {
      req.body = { email: 'unknown@example.com', password: 'pass' };
      User.findOne.mockResolvedValue(null);

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
    });

    it('should return 401 if password does not match', async () => {
      req.body = { email: 'alice@example.com', password: 'wrong' };
      User.findOne.mockResolvedValue({
        _id: 'u1',
        passwordHash: 'hash',
      });
      bcrypt.compare.mockResolvedValue(false);

      await login(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('wrong', 'hash');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
    });

    it('should return token and user profile on successful login', async () => {
      req.body = { email: 'alice@example.com', password: 'correct' };
      const foundUser = {
        _id: { toString: () => 'u1' },
        name: 'Alice',
        email: 'alice@example.com',
        role: 'customer',
        passwordHash: 'hash',
      };
      User.findOne.mockResolvedValue(foundUser);
      bcrypt.compare.mockResolvedValue(true);

      await login(req, res);

      expect(res.json).toHaveBeenCalledWith({
        token: expect.any(String),
        user: {
          id: foundUser._id,
          name: 'Alice',
          email: 'alice@example.com',
          role: 'customer',
        },
      });
    });

    it('should return 500 on unexpected login errors', async () => {
      req.body = { email: 'alice@example.com', password: 'pass' };
      User.findOne.mockRejectedValue(new Error('Connection failed'));

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Connection failed' });
    });
  });

  describe('profile', () => {
    it('should return 404 if user is not found', async () => {
      req.user = { id: 'u1' };
      const selectMock = jest.fn().mockResolvedValue(null);
      User.findById.mockReturnValue({ select: selectMock });

      await profile(req, res);

      expect(User.findById).toHaveBeenCalledWith('u1');
      expect(selectMock).toHaveBeenCalledWith('-passwordHash');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    });

    it('should return user profile if user is found', async () => {
      req.user = { id: 'u1' };
      const userProfile = { _id: 'u1', name: 'Alice', email: 'alice@example.com', role: 'customer' };
      const selectMock = jest.fn().mockResolvedValue(userProfile);
      User.findById.mockReturnValue({ select: selectMock });

      await profile(req, res);

      expect(res.json).toHaveBeenCalledWith(userProfile);
    });

    it('should return 500 on unexpected profile errors', async () => {
      req.user = { id: 'u1' };
      User.findById.mockImplementation(() => {
        throw new Error('Query error');
      });

      await profile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Query error' });
    });
  });
});
