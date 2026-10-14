const crypto = require('crypto');

function generateTraceId() {
  try {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.randomBytes === 'function') {
      return 'trace_' + Date.now().toString(36) + '_' + crypto.randomBytes(8).toString('hex');
    }
  } catch (_) {}
  return 'trace_' + Date.now().toString(36) + '_' + process.pid.toString(36);
}

function correlationMiddleware(req, res, next) {
  const incomingId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  const correlationId = (incomingId && typeof incomingId === 'string' && incomingId.trim())
    ? incomingId.trim()
    : generateTraceId();

  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  next();
}

function attachProxyCorrelation(proxyReq, req) {
  if (req && req.correlationId && proxyReq && typeof proxyReq.setHeader === 'function') {
    proxyReq.setHeader('x-correlation-id', req.correlationId);
  }
}

module.exports = {
  correlationMiddleware,
  attachProxyCorrelation,
  generateTraceId
};
