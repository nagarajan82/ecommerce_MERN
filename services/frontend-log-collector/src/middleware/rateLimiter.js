const rateLimit = require('express-rate-limit');
const config = require('../config/env');

function createRateLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || config.rateLimitWindowMs,
    max: options.max !== undefined ? options.max : config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.'
      });
    },
    ...options
  });
}

const defaultRateLimiter = createRateLimiter();

module.exports = {
  createRateLimiter,
  defaultRateLimiter
};
