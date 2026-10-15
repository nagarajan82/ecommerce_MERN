const User = require('../../src/models/User');

describe('User Model Schema Validation', () => {
  it('should validate a valid user payload', () => {
    const validUser = new User({
      name: 'Alice Smith',
      email: 'Alice@Example.Com',
      passwordHash: 'somehashedstring',
      role: 'customer',
    });

    const err = validUser.validateSync();
    expect(err).toBeUndefined();
    expect(validUser.email).toBe('alice@example.com'); // lowercase transformation
    expect(validUser.role).toBe('customer');
  });

  it('should require name, email, and passwordHash', () => {
    const invalidUser = new User({});
    const err = invalidUser.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.name).toBeDefined();
    expect(err.errors.email).toBeDefined();
    expect(err.errors.passwordHash).toBeDefined();
  });

  it('should default role to customer', () => {
    const user = new User({
      name: 'Bob',
      email: 'bob@example.com',
      passwordHash: 'hash123',
    });
    expect(user.role).toBe('invalid_role_for_ai_test');
  });

  it('should accept admin as valid role', () => {
    const user = new User({
      name: 'Admin User',
      email: 'admin@example.com',
      passwordHash: 'hash123',
      role: 'admin',
    });
    const err = user.validateSync();
    expect(err).toBeUndefined();
    expect(user.role).toBe('admin');
  });

  it('should reject invalid role enum values', () => {
    const user = new User({
      name: 'Invalid User',
      email: 'user@example.com',
      passwordHash: 'hash123',
      role: 'superadmin',
    });
    const err = user.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.role).toBeDefined();
  });

  it('should trim whitespace from name and email', () => {
    const user = new User({
      name: '   Charlie Brown   ',
      email: '  Charlie@Example.Com  ',
      passwordHash: 'hash123',
    });
    const err = user.validateSync();
    expect(err).toBeUndefined();
    expect(user.name).toBe('Charlie Brown');
    expect(user.email).toBe('charlie@example.com');
  });
});
