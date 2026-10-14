const { correlationMiddleware, attachProxyCorrelation, generateTraceId } = require('../src/middleware/correlation');
const { createErrorHandler } = require('../src/middleware/errorHandler');

describe('Correlation Middleware & Error Handler', () => {
  test('generates trace ID if missing and sets header', () => {
    const req = { headers: {} };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    correlationMiddleware(req, res, next);

    expect(req.correlationId).toBeDefined();
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', req.correlationId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('preserves existing x-correlation-id header', () => {
    const req = { headers: { 'x-correlation-id': 'custom-trace-123' } };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    correlationMiddleware(req, res, next);

    expect(req.correlationId).toBe('custom-trace-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'custom-trace-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('attachProxyCorrelation forwards x-correlation-id to proxyReq', () => {
    const proxyReq = { setHeader: jest.fn() };
    const req = { correlationId: 'trace-forward-456' };

    attachProxyCorrelation(proxyReq, req);
    expect(proxyReq.setHeader).toHaveBeenCalledWith('x-correlation-id', 'trace-forward-456');
  });

  test('createErrorHandler logs error and responds with status and correlationId', () => {
    const mockLogger = { error: jest.fn() };
    const errorHandler = createErrorHandler(mockLogger);

    const err = new Error('Test server error');
    err.statusCode = 500;
    const req = {
      correlationId: 'err-trace-789',
      method: 'POST',
      originalUrl: '/api/charge'
    };
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    errorHandler(err, req, res, next);

    expect(mockLogger.error).toHaveBeenCalledWith(
      'HTTP 500 - Test server error',
      expect.objectContaining({
        correlationId: 'err-trace-789',
        method: 'POST',
        path: '/api/charge',
        status: 500,
        error: err
      })
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'err-trace-789'
      })
    );
  });

  test('generateTraceId generates valid trace IDs', () => {
    const id = generateTraceId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});
