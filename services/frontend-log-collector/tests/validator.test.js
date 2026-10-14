const { validateEvent, validateLogPayload, isValidTimestamp } = require('../src/middleware/validator');
const config = require('../src/config/env');

describe('Validator Middleware & Utilities', () => {
  describe('isValidTimestamp', () => {
    it('returns true for valid ISO strings', () => {
      expect(isValidTimestamp('2026-10-14T12:00:00.000Z')).toBe(true);
      expect(isValidTimestamp(new Date().toISOString())).toBe(true);
    });

    it('returns false for invalid timestamps', () => {
      expect(isValidTimestamp('')).toBe(false);
      expect(isValidTimestamp('not-a-date')).toBe(false);
      expect(isValidTimestamp(null)).toBe(false);
      expect(isValidTimestamp(123456789)).toBe(false);
    });
  });

  describe('validateEvent', () => {
    const validEvent = {
      id: 'evt-123',
      timestamp: '2026-10-14T12:00:00.000Z',
      level: 'error',
      appName: 'frontend-shell',
      message: 'Network error occurred',
      category: 'runtime_error',
      environment: 'production',
      metadata: { status: 500 },
      duplicateCount: 1
    };

    it('accepts a fully compliant event', () => {
      const errors = validateEvent(validEvent);
      expect(errors).toEqual([]);
    });

    it('flags non-object items', () => {
      expect(validateEvent(null)).toContain('Log event must be an object');
      expect(validateEvent('string')).toContain('Log event must be an object');
      expect(validateEvent([])).toContain('Log event must be an object');
    });

    it('flags missing required fields', () => {
      const empty = {};
      const errors = validateEvent(empty);
      expect(errors.some((e) => e.includes("'id' is required"))).toBe(true);
      expect(errors.some((e) => e.includes("'timestamp' is required"))).toBe(true);
      expect(errors.some((e) => e.includes("'level' must be one of"))).toBe(true);
      expect(errors.some((e) => e.includes("'appName' is required"))).toBe(true);
      expect(errors.some((e) => e.includes("'message' is required"))).toBe(true);
    });

    it('validates allowed levels', () => {
      expect(validateEvent({ ...validEvent, level: 'info' })).toEqual([]);
      expect(validateEvent({ ...validEvent, level: 'warn' })).toEqual([]);
      expect(validateEvent({ ...validEvent, level: 'error' })).toEqual([]);

      const invalidLevelErrors = validateEvent({ ...validEvent, level: 'debug' });
      expect(invalidLevelErrors.some((e) => e.includes("'level' must be one of"))).toBe(true);
    });

    it('validates optional metadata must be an object if present', () => {
      const badMetaArray = validateEvent({ ...validEvent, metadata: ['array'] });
      expect(badMetaArray.some((e) => e.includes("'metadata' must be a plain object"))).toBe(true);

      const badMetaPrim = validateEvent({ ...validEvent, metadata: 'string' });
      expect(badMetaPrim.some((e) => e.includes("'metadata' must be a plain object"))).toBe(true);
    });

    it('validates duplicateCount must be a positive integer', () => {
      const badCount = validateEvent({ ...validEvent, duplicateCount: 0 });
      expect(badCount.some((e) => e.includes("'duplicateCount' must be a positive integer"))).toBe(true);

      const floatCount = validateEvent({ ...validEvent, duplicateCount: 1.5 });
      expect(floatCount.some((e) => e.includes("'duplicateCount' must be a positive integer"))).toBe(true);
    });
  });

  describe('validateLogPayload Middleware', () => {
    let mockReq;
    let mockRes;
    let next;

    beforeEach(() => {
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      next = jest.fn();
    });

    it('returns 400 when body is missing', () => {
      mockReq = { body: null };
      validateLogPayload(mockReq, mockRes, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation failed' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 when body is an empty batch', () => {
      mockReq = { body: [] };
      validateLogPayload(mockReq, mockRes, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ details: ['Batch cannot be empty'] })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 when batch exceeds maxBatchSize', () => {
      const largeBatch = new Array(config.maxBatchSize + 1).fill({
        id: '1',
        timestamp: '2026-10-14T12:00:00.000Z',
        level: 'info',
        appName: 'app',
        message: 'msg'
      });
      mockReq = { body: largeBatch };
      validateLogPayload(mockReq, mockRes, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          details: [expect.stringContaining(`exceeds maximum limit of ${config.maxBatchSize}`)]
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('passes single valid event and populates req.validatedEvents', () => {
      mockReq = {
        body: {
          id: 'test-1',
          timestamp: '2026-10-14T12:00:00.000Z',
          level: 'WARN',
          appName: 'catalog-mfe',
          message: 'Product fetch delayed'
        }
      };
      validateLogPayload(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
      expect(mockReq.validatedEvents).toHaveLength(1);
      expect(mockReq.validatedEvents[0].level).toBe('warn');
      expect(mockReq.validatedEvents[0].category).toBe('application');
      expect(mockReq.validatedEvents[0].duplicateCount).toBe(1);
    });

    it('passes valid batch of events', () => {
      mockReq = {
        body: [
          {
            id: 'test-1',
            timestamp: '2026-10-14T12:00:00.000Z',
            level: 'info',
            appName: 'orders-mfe',
            message: 'Order viewed'
          },
          {
            id: 'test-2',
            timestamp: '2026-10-14T12:00:01.000Z',
            level: 'error',
            appName: 'checkout-mfe',
            message: 'Payment form error'
          }
        ]
      };
      validateLogPayload(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
      expect(mockReq.validatedEvents).toHaveLength(2);
    });
  });
});
