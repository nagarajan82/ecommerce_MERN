require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const {
  createProxyMiddleware,
  fixRequestBody,
} = require('http-proxy-middleware');

const {
  createLogger,
  createTelemetryMiddleware,
  correlationMiddleware,
  attachProxyCorrelation,
  createErrorHandler,
} = require('@repo/observability');

const logger = createLogger('gateway');
const app = express();

const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

const services = {
  user: process.env.USER_SERVICE_URL || 'http://127.0.0.1:4001',
  product: process.env.PRODUCT_SERVICE_URL || 'http://127.0.0.1:4002',
  order: process.env.ORDER_SERVICE_URL || 'http://127.0.0.1:4003',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://127.0.0.1:4004',
};

// 1. Correlation tracking (generates or propagates x-correlation-id)
app.use(correlationMiddleware);

// 2. CORS
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));

// 3. API Telemetry with swagger-stats
app.use(createTelemetryMiddleware('gateway', { serviceType: 'gateway' }));

// 4. Rate limiting
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// 5. Operational HTTP request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, {
    correlationId: req.correlationId,
    method: req.method,
    path: req.originalUrl,
  });
  next();
});

function attachUser(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return next();

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    req.user = null;
  }

  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

function proxyWithPrefix(target, prefix) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (path) => `${prefix}${path}`,
    on: {
      proxyReq: (proxyReq, req, res) => {
        fixRequestBody(proxyReq, req, res);
        attachProxyCorrelation(proxyReq, req);
      },
      error: (err, req, res) => {
        logger.error(`Proxy failure forwarding to ${target}: ${err.message}`, {
          correlationId: req?.correlationId,
          method: req?.method,
          path: req?.originalUrl,
          error: err,
        });
        if (!res.headersSent) {
          res.status(502).json({
            message: 'Bad Gateway - Service Unavailable',
            correlationId: req?.correlationId,
          });
        }
      },
    },
  });
}

app.use(attachUser);

app.get('/health', (req, res) => {
  res.json({
    service: 'gateway',
    ok: true,
    services,
  });
});

app.use('/api/auth', proxyWithPrefix(services.user, '/api/auth'));
app.use('/api/products', proxyWithPrefix(services.product, '/api/products'));

app.use('/api/orders', requireAuth);
app.use('/api/orders', proxyWithPrefix(services.order, '/api/orders'));

app.use('/api/payments', proxyWithPrefix(services.payment, '/api/payments'));

// Centralized error handler
app.use(createErrorHandler(logger));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception in gateway process', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error(
    'Unhandled Rejection in gateway process',
    reason instanceof Error ? reason : new Error(String(reason))
  );
});

if (require.main === module) {
  const server = app.listen(PORT, () => {
    logger.info(`Gateway running on ${PORT}`);
    logger.info('Proxy targets configured', { targets: services });
  });

  const shutdown = (signal) => {
    logger.info(`Received ${signal}, shutting down gateway gracefully...`);
    server.close(() => {
      logger.info('Gateway HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = {
  app,
  attachUser,
  requireAuth,
  proxyWithPrefix,
  services,
  logger,
};
