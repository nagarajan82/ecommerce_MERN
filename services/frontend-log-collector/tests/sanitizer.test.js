const {
  sanitizeString,
  sanitizeMetadata,
  sanitizeEvent,
  sanitizeLogsMiddleware
} = require('../src/middleware/sanitizer');

describe('Sanitizer Middleware & Functions', () => {
  describe('sanitizeString', () => {
    it('redacts Bearer tokens', () => {
      const msg = 'Failed auth with Bearer eyJhbGciOiJIUzI1NiJ9.abc.def';
      const cleaned = sanitizeString(msg);
      expect(cleaned).toContain('Bearer [REDACTED]');
      expect(cleaned).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    });

    it('redacts JWT tokens directly', () => {
      const msg = 'Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgN passed';
      const cleaned = sanitizeString(msg);
      expect(cleaned).toContain('[REDACTED_TOKEN]');
      expect(cleaned).not.toContain('eyJhbGci');
    });

    it('redacts emails', () => {
      const msg = 'User customer@domain.com encountered checkout crash';
      const cleaned = sanitizeString(msg);
      expect(cleaned).toBe('User [REDACTED_EMAIL] encountered checkout crash');
    });

    it('redacts credit card numbers (delimited and raw)', () => {
      const msg1 = 'Payment with card 4111-2222-3333-4444 failed';
      expect(sanitizeString(msg1)).toBe('Payment with card [REDACTED_CARD] failed');

      const msg2 = 'Card 4111222233334444 declined';
      expect(sanitizeString(msg2)).toBe('Card [REDACTED_CARD] declined');
    });

    it('redacts passwords in text', () => {
      const msg = 'Config: password=MySecretPassword123; error occurred';
      expect(sanitizeString(msg)).toContain('password=[REDACTED]');
      expect(sanitizeString(msg)).not.toContain('MySecretPassword123');
    });

    it('redacts sensitive query parameters', () => {
      const msg = 'GET /api/user?token=secret123&user=john';
      expect(sanitizeString(msg)).toContain('?token=[REDACTED]&user=john');
    });
  });

  describe('sanitizeMetadata', () => {
    it('redacts sensitive keys in object', () => {
      const meta = {
        userId: 'u123',
        password: 'PlainTextPassword',
        authToken: 'secret-token-value',
        cvv: '123'
      };
      const cleaned = sanitizeMetadata(meta);
      expect(cleaned.userId).toBe('u123');
      expect(cleaned.password).toBe('[REDACTED]');
      expect(cleaned.authToken).toBe('[REDACTED]');
      expect(cleaned.cvv).toBe('[REDACTED]');
    });

    it('redacts body and payload keys in metadata', () => {
      const meta = {
        endpoint: '/api/checkout',
        body: { cardNumber: '1234', amount: 50 },
        payload: { items: [1, 2] }
      };
      const cleaned = sanitizeMetadata(meta);
      expect(cleaned.endpoint).toBe('/api/checkout');
      expect(cleaned.body).toBe('[REDACTED_BODY]');
      expect(cleaned.payload).toBe('[REDACTED_BODY]');
    });

    it('handles circular references without throwing', () => {
      const circular = { name: 'circular-test' };
      circular.self = circular;

      expect(() => {
        const cleaned = sanitizeMetadata(circular);
        expect(cleaned.name).toBe('circular-test');
        expect(cleaned.self).toBe('[CIRCULAR]');
      }).not.toThrow();
    });
  });

  describe('sanitizeEvent and Middleware', () => {
    it('sanitizes event message and metadata', () => {
      const event = {
        id: '1',
        message: 'Auth fail for user test@example.com with password=secret',
        metadata: { token: 'my-token', code: 401 }
      };
      const sanitized = sanitizeEvent(event);
      expect(sanitized.message).toContain('[REDACTED_EMAIL]');
      expect(sanitized.message).toContain('password=[REDACTED]');
      expect(sanitized.metadata.token).toBe('[REDACTED]');
      expect(sanitized.metadata.code).toBe(401);
    });

    it('middleware cleans all req.validatedEvents', () => {
      const req = {
        validatedEvents: [
          {
            id: '1',
            message: 'User a@b.com failed',
            metadata: { secret: 'topsecret' }
          }
        ]
      };
      const next = jest.fn();
      sanitizeLogsMiddleware(req, {}, next);
      expect(next).toHaveBeenCalled();
      expect(req.validatedEvents[0].message).toContain('[REDACTED_EMAIL]');
      expect(req.validatedEvents[0].metadata.secret).toBe('[REDACTED]');
    });
  });
});
