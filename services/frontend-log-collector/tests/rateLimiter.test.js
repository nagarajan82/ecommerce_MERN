const express = require('express');
const request = require('supertest');
const { createRateLimiter } = require('../src/middleware/rateLimiter');

describe('Rate Limiter Middleware', () => {
  it('allows requests within threshold and blocks with 429 when exceeded', async () => {
    const testApp = express();
    const limiter = createRateLimiter({
      windowMs: 5000,
      max: 2
    });

    testApp.use('/test-rate', limiter, (req, res) => {
      res.status(200).json({ ok: true });
    });

    // Request 1: OK
    const res1 = await request(testApp).get('/test-rate');
    expect(res1.status).toBe(200);

    // Request 2: OK
    const res2 = await request(testApp).get('/test-rate');
    expect(res2.status).toBe(200);

    // Request 3: Blocked (429)
    const res3 = await request(testApp).get('/test-rate');
    expect(res3.status).toBe(429);
    expect(res3.body).toEqual({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.'
    });
  });
});
