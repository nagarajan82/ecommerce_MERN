import {
  createLogger,
  getLogs,
  getQueue,
  clearLogs,
  flushLogs,
  configureLogger,
  sanitizeString,
  sanitizeMetadata,
  initGlobalErrorHandlers
} from './logger';

describe('browser logger module', () => {
  beforeEach(() => {
    clearLogs();
    delete window.__GLOBAL_ERROR_HANDLERS_INSTALLED__;
  });

  afterEach(() => {
    clearLogs();
    delete window.__GLOBAL_ERROR_HANDLERS_INSTALLED__;
  });

  describe('event schema and application identity', () => {
    it('creates standardized log events with valid schema and ISO timestamps', () => {
      const logger = createLogger('test-app');
      const event = logger.info('System initialized', { version: '1.0' });

      expect(event).toBeDefined();
      expect(typeof event.id).toBe('string');
      expect(event.id.length).toBeGreaterThan(0);
      expect(event.level).toBe('info');
      expect(event.appName).toBe('test-app');
      expect(event.category).toBe('application');
      expect(event.message).toBe('System initialized');
      expect(event.metadata).toEqual({ version: '1.0' });
      expect(typeof event.environment).toBe('string');

      // ISO 8601 timestamp validation
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    });

    it('supports custom category via metadata', () => {
      const logger = createLogger('test-app');
      const event = logger.warn('Low disk space', { category: 'system' });

      expect(event.category).toBe('system');
      expect(event.metadata).toEqual({});
    });

    it('supports error and warn levels', () => {
      const logger = createLogger('test-app');
      const errEvent = logger.error('Failure occurred');
      const warnEvent = logger.warn('Potential issue');

      expect(errEvent.level).toBe('error');
      expect(warnEvent.level).toBe('warn');
    });

    it('preserves application identity across different logger instances in shared runtime', () => {
      const shellLogger = createLogger('frontend-shell');
      const authLogger = createLogger('auth-mfe');
      const catalogLogger = createLogger('catalog-mfe');

      shellLogger.info('Shell boot');
      authLogger.warn('Auth token expiring');
      catalogLogger.error('Product not found');

      const logs = getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].appName).toBe('frontend-shell');
      expect(logs[1].appName).toBe('auth-mfe');
      expect(logs[2].appName).toBe('catalog-mfe');
    });

    it('falls back to default appName if omitted or empty', () => {
      const logger1 = createLogger();
      const logger2 = createLogger('   ');

      expect(logger1.appName).toBe('unknown-app');
      expect(logger2.appName).toBe('unknown-app');
    });
  });

  describe('buffer insertion, capacity limits, and clearLogs', () => {
    it('records logs in order and exposes them via getLogs()', () => {
      const logger = createLogger('test-app');
      logger.info('First');
      logger.info('Second');
      logger.info('Third');

      const logs = getLogs();
      expect(logs).toHaveLength(3);
      expect(logs.map((l) => l.message)).toEqual(['First', 'Second', 'Third']);
    });

    it('returns an immutable copy from getLogs()', () => {
      const logger = createLogger('test-app');
      logger.info('Log 1');

      const logs = getLogs();
      logs.push({ fake: true });

      expect(getLogs()).toHaveLength(1);
    });

    it('enforces circular buffer capacity limit of 100 and removes oldest entries', () => {
      const logger = createLogger('test-app');

      for (let i = 1; i <= 105; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = getLogs();
      expect(logs).toHaveLength(100);
      expect(logs[0].message).toBe('Message 6');
      expect(logs[99].message).toBe('Message 105');
    });

    it('clears all logs on clearLogs()', () => {
      const logger = createLogger('test-app');
      logger.info('Log A');
      logger.warn('Log B');
      expect(getLogs()).toHaveLength(2);

      clearLogs();
      expect(getLogs()).toHaveLength(0);
    });

    it('exposes getLogs and clearLogs on logger instances as well', () => {
      const logger = createLogger('test-app');
      logger.info('Instance test');
      expect(logger.getLogs()).toHaveLength(1);

      logger.clearLogs();
      expect(logger.getLogs()).toHaveLength(0);
    });

    it('deduplicates identical events within dedupe window and updates duplicateCount', () => {
      const logger = createLogger('test-app');
      logger.error('Database connection timed out');
      logger.error('Database connection timed out');
      logger.error('Database connection timed out');

      const logs = getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Database connection timed out');
      expect(logs[0].duplicateCount).toBe(3);
    });
  });

  describe('sensitive-data redaction in messages and metadata', () => {
    it('redacts bearer tokens and JWTs in log messages', () => {
      const logger = createLogger('test-app');
      const fakeJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature123';
      const event = logger.error(`Request failed with Bearer ${fakeJwt}`);

      expect(event.message).not.toContain(fakeJwt);
      expect(event.message).toContain('Bearer [REDACTED]');
    });

    it('redacts email addresses in messages', () => {
      const logger = createLogger('test-app');
      const event = logger.info(
        'Account created for user.name@domain.co.uk successfully'
      );

      expect(event.message).not.toContain('user.name@domain.co.uk');
      expect(event.message).toContain('[REDACTED_EMAIL]');
    });

    it('redacts payment-card-like numbers in messages', () => {
      const logger = createLogger('test-app');
      const event1 = logger.info(
        'Payment processed on card 4111-2222-3333-4444'
      );
      const event2 = logger.info(
        'Payment processed on card 4111 2222 3333 4444'
      );
      const event3 = logger.info('Payment card 4111222233334444 failed');

      expect(event1.message).toContain('[REDACTED_CARD]');
      expect(event1.message).not.toContain('4111-2222-3333-4444');
      expect(event2.message).toContain('[REDACTED_CARD]');
      expect(event3.message).toContain('[REDACTED_CARD]');
    });

    it('redacts password, authorization, cookie, and query params in messages', () => {
      const logger = createLogger('test-app');
      const event = logger.warn(
        'Failed login password: mySecretPassword123 with cookie: session=abc; authorization: Basic dXNlcjpwYXNz and url https://example.com/api?token=secret123'
      );

      expect(event.message).not.toContain('mySecretPassword123');
      expect(event.message).toContain('password: [REDACTED]');
      expect(event.message).toContain('cookie: [REDACTED]');
      expect(event.message).toContain('authorization: [REDACTED]');
      expect(event.message).toContain('token=[REDACTED]');
    });

    it('redacts sensitive keys in metadata objects', () => {
      const logger = createLogger('test-app');
      const event = logger.error('Auth error', {
        password: 'plain_password',
        token: 'secret_token_val',
        refreshToken: 'refresh_secret',
        authorization: 'Bearer secret',
        cookie: 'sid=123',
        cvv: '123',
        safeField: 'normal value'
      });

      expect(event.metadata.password).toBe('[REDACTED]');
      expect(event.metadata.token).toBe('[REDACTED]');
      expect(event.metadata.refreshToken).toBe('[REDACTED]');
      expect(event.metadata.authorization).toBe('[REDACTED]');
      expect(event.metadata.cookie).toBe('[REDACTED]');
      expect(event.metadata.cvv).toBe('[REDACTED]');
      expect(event.metadata.safeField).toBe('normal value');
    });

    it('redacts request and response bodies in metadata', () => {
      const logger = createLogger('test-app');
      const event = logger.error('API failure', {
        requestBody: { email: 'test@example.com', password: 'xyz' },
        responseBody: 'Internal Server Error trace...',
        body: { creditCard: '1234' }
      });

      expect(event.metadata.requestBody).toBe('[REDACTED_BODY]');
      expect(event.metadata.responseBody).toBe('[REDACTED_BODY]');
      expect(event.metadata.body).toBe('[REDACTED_BODY]');
    });

    it('sanitizes nested metadata objects and arrays recursively', () => {
      const logger = createLogger('test-app');
      const event = logger.info('Nested check', {
        user: {
          profile: {
            email: 'admin@corp.net',
            authToken: 'token123'
          }
        },
        items: [{ secretKey: 'topsecret' }, { name: 'laptop' }]
      });

      expect(event.metadata.user.profile.email).toBe('[REDACTED_EMAIL]');
      expect(event.metadata.user.profile.authToken).toBe('[REDACTED]');
      expect(event.metadata.items[0].secretKey).toBe('[REDACTED]');
      expect(event.metadata.items[1].name).toBe('laptop');
    });

    it('handles Error objects passed as message or in metadata', () => {
      const logger = createLogger('test-app');
      const error = new Error('Database connection failed for admin@corp.net');
      const event = logger.error(error);

      expect(event.message).toBe(
        'Database connection failed for [REDACTED_EMAIL]'
      );
      expect(event.metadata.error).toBeDefined();
      expect(event.metadata.error.name).toBe('Error');
      expect(event.metadata.error.message).toBe(
        'Database connection failed for [REDACTED_EMAIL]'
      );
    });

    it('handles circular references in metadata safely', () => {
      const logger = createLogger('test-app');
      const circularObj = { name: 'cycle' };
      circularObj.self = circularObj;

      const event = logger.warn('Circular metadata', circularObj);
      expect(event.metadata.name).toBe('cycle');
      expect(event.metadata.self).toBe('[CIRCULAR]');
    });
  });

  describe('global error handlers', () => {
    let cleanup;

    afterEach(() => {
      if (typeof cleanup === 'function') {
        cleanup();
        cleanup = null;
      }
    });

    it('captures uncaught window error events with runtime_error category', () => {
      cleanup = initGlobalErrorHandlers('frontend-shell');

      const errorEvent = new ErrorEvent('error', {
        message: 'Uncaught Script Error',
        filename: 'http://localhost:3000/main.js',
        lineno: 10,
        colno: 5,
        error: new Error('Uncaught Script Error')
      });

      window.dispatchEvent(errorEvent);

      const logs = getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].category).toBe('runtime_error');
      expect(logs[0].appName).toBe('frontend-shell');
      expect(logs[0].message).toBe('Uncaught Script Error');
    });

    it('captures unhandled promise rejections with unhandled_rejection category', () => {
      cleanup = initGlobalErrorHandlers('frontend-shell');

      const rejectionEvent = new Event('unhandledrejection');
      rejectionEvent.reason = new Error('Async network drop');
      window.dispatchEvent(rejectionEvent);

      const logs = getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].category).toBe('unhandled_rejection');
      expect(logs[0].message).toBe('Async network drop');
    });

    it('ignores errors already marked as handled by an ErrorBoundary', () => {
      cleanup = initGlobalErrorHandlers('frontend-shell');

      const boundaryHandledError = new Error('React caught this');
      boundaryHandledError.__handledByBoundary = true;

      const errorEvent = new ErrorEvent('error', {
        message: 'React caught this',
        error: boundaryHandledError
      });

      window.dispatchEvent(errorEvent);

      const logs = getLogs();
      expect(logs).toHaveLength(0);
    });

    it('guards against multiple installations across MFEs in the same window', () => {
      const cleanup1 = initGlobalErrorHandlers('shell-app');
      const cleanup2 = initGlobalErrorHandlers('remote-app');

      expect(typeof cleanup1).toBe('function');
      expect(typeof cleanup2).toBe('function');

      const errorEvent = new ErrorEvent('error', {
        message: 'Single event test',
        error: new Error('Single event test')
      });
      window.dispatchEvent(errorEvent);

      // Only one log entry should be recorded, from shell-app
      const logs = getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].appName).toBe('shell-app');

      cleanup1();
      cleanup2();
    });
  });

  describe('robustness and non-browser environment fallback', () => {
    it('handles non-string, null, or undefined message without throwing', () => {
      const logger = createLogger('test-app');
      expect(() => logger.info(null)).not.toThrow();
      expect(() => logger.warn(undefined)).not.toThrow();
      expect(() => logger.error(12345)).not.toThrow();
    });

    it('functions safely when window is undefined', () => {
      const originalWindow = global.window;
      try {
        try {
          delete global.window;
        } catch (_) {
          global.window = undefined;
        }
        const fallbackLogger = createLogger('isolated-app');
        const event = fallbackLogger.info('Standalone mode');

        expect(event).toBeDefined();
        expect(event.appName).toBe('isolated-app');
        expect(event.message).toBe('Standalone mode');
        expect(fallbackLogger.getLogs()).toContain(event);

        fallbackLogger.clearLogs();
        expect(fallbackLogger.getLogs()).toHaveLength(0);
      } finally {
        global.window = originalWindow;
      }
    });

    it('isolates state cleanly across clearLogs() calls between tests', () => {
      expect(getLogs()).toHaveLength(0);
      const logger = createLogger('test-app');
      logger.info('Temporary test log');
      expect(getLogs()).toHaveLength(1);
    });
  });

  describe('collector transport and log delivery', () => {
    let originalFetch;
    let mockFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
      mockFetch = jest.fn().mockResolvedValue({
        status: 201,
        ok: true,
        json: async () => ({ success: true, ingested: 1 })
      });
      global.fetch = mockFetch;
      window.fetch = mockFetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      window.fetch = originalFetch;
      delete window.__LOG_COLLECTOR_URL__;
    });

    it('delivers log events to collector /api/logs with application/json header', async () => {
      const logger = createLogger('frontend-shell');
      logger.error('Critical payment failure');

      await flushLogs();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4006/api/logs');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const payload = JSON.parse(options.body);
      expect(Array.isArray(payload)).toBe(true);
      expect(payload).toHaveLength(1);
      expect(payload[0].appName).toBe('frontend-shell');
      expect(payload[0].level).toBe('error');
      expect(payload[0].message).toBe('Critical payment failure');
    });

    it('respects custom collector URL from configureLogger and window.__LOG_COLLECTOR_URL__', async () => {
      configureLogger({ collectorUrl: 'http://custom-collector:5050' });
      const logger = createLogger('auth-mfe');
      logger.info('User logged in');

      await flushLogs();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('http://custom-collector:5050/api/logs');
    });

    it('batches multiple events up to batch size limit of 50', async () => {
      const logger = createLogger('catalog-mfe');
      for (let i = 0; i < 65; i++) {
        logger.info(`Product item ${i}`);
      }

      expect(getQueue().length).toBe(65);

      const res1 = await flushLogs();
      expect(res1.count).toBe(50);
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toHaveLength(50);
      expect(getQueue().length).toBe(15);
    });

    it('handles collector downtime and network failure gracefully without throwing', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
      const logger = createLogger('checkout-mfe');

      expect(() => logger.error('Order timeout')).not.toThrow();
      const flushResult = await flushLogs();

      expect(flushResult.success).toBe(false);
      expect(flushResult.error).toBeDefined();
      expect(getQueue().length).toBe(1);
    });

    it('drops batch when retry limit exceeds 3 attempts to prevent starvation', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const logger = createLogger('orders-mfe');
      logger.info('Polling orders');

      await flushLogs();
      await flushLogs();
      await flushLogs();
      expect(getQueue().length).toBe(1);

      await flushLogs();
      expect(getQueue().length).toBe(0);
    });

    it('drops invalid batch immediately on HTTP 4xx response to prevent infinite loops', async () => {
      mockFetch.mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ error: 'Validation failed' })
      });
      const logger = createLogger('frontend-shell');
      logger.info('Bad payload');

      const res = await flushLogs();
      expect(res.status).toBe(400);
      expect(getQueue().length).toBe(0);
    });

    it('prevents concurrent duplicate transmission when request is in flight', async () => {
      let resolveFetch;
      mockFetch.mockImplementation(
        () => new Promise((resolve) => { resolveFetch = resolve; })
      );

      const logger = createLogger('frontend-shell');
      logger.info('In-flight test');

      const promise1 = flushLogs();
      const promise2 = flushLogs();

      const res2 = await promise2;
      expect(res2.inFlight).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      resolveFetch({ status: 201, ok: true, json: async () => ({}) });
      await promise1;
    });

    it('verifies sensitive data is redacted before transport transmission', async () => {
      const logger = createLogger('auth-mfe');
      logger.error('Login failed for user customer@test.com with Bearer eyJhbGciOiJIUzI1NiJ9.abc.def and password=SecretPass', {
        password: 'PlainTextSecret',
        card: '4111-2222-3333-4444'
      });

      await flushLogs();

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body)[0];
      expect(payload.message).toContain('[REDACTED_EMAIL]');
      expect(payload.message).toContain('Bearer [REDACTED]');
      expect(payload.message).toContain('password=[REDACTED]');
      expect(payload.message).not.toContain('customer@test.com');
      expect(payload.message).not.toContain('eyJhbGci');
      expect(payload.message).not.toContain('SecretPass');
      expect(payload.metadata.password).toBe('[REDACTED]');
      expect(payload.metadata.card).toBe('[REDACTED_CARD]');
    });

    it('does not cause recursive logging when transport fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('Fatal connection drop'));
      const logger = createLogger('orders-mfe');
      const initialLogsCount = getLogs().length;

      logger.error('Transport test');
      await flushLogs();

      const finalLogs = getLogs();
      expect(finalLogs.length).toBe(initialLogsCount + 1);
      expect(finalLogs[0].message).toBe('Transport test');
    });
  });
});
