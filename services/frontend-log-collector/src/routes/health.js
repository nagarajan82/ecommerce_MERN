const express = require('express');
const router = express.Router();
const elasticClient = require('../services/elasticClient');

router.get('/health', async (req, res) => {
  try {
    const esHealth = await elasticClient.checkHealth();
    res.status(200).json({
      status: 'ok',
      service: 'frontend-log-collector',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      elasticsearch: esHealth
    });
  } catch (_) {
    res.status(200).json({
      status: 'ok',
      service: 'frontend-log-collector',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      elasticsearch: {
        configured: false,
        status: 'error'
      }
    });
  }
});

module.exports = router;
