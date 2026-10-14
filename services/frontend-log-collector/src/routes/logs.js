const express = require('express');
const router = express.Router();
const { validateLogPayload } = require('../middleware/validator');
const { sanitizeLogsMiddleware } = require('../middleware/sanitizer');
const { defaultRateLimiter } = require('../middleware/rateLimiter');
const elasticClient = require('../services/elasticClient');

router.post(
  '/logs',
  defaultRateLimiter,
  validateLogPayload,
  sanitizeLogsMiddleware,
  async (req, res) => {
    const events = req.validatedEvents;

    try {
      if (events.length === 1) {
        await elasticClient.indexLog(events[0]);
      } else {
        await elasticClient.indexLogsBulk(events);
      }

      return res.status(201).json({
        success: true,
        ingested: events.length
      });
    } catch (error) {
      // Intentionally avoid logging full payloads to console for security
      const safeReason = error && error.message ? error.message : 'Unknown storage error';
      console.error(`[LOG COLLECTOR] Ingestion error: ${safeReason}`);

      return res.status(503).json({
        error: 'Log storage backend unavailable',
        details: 'Failed to ingest log events into backend storage'
      });
    }
  }
);

module.exports = router;
