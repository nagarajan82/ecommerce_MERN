const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { port, mongoUri, rabbitUrl, frontendOrigin } = require('./config/env');
const { connectRabbit } = require('@repo/event-bus');
const {
  createLogger,
  createTelemetryMiddleware,
  correlationMiddleware,
  createErrorHandler,
} = require('@repo/observability');
const productRoutes = require('./routes/productRoutes');
const { registerOrderPaidConsumer } = require('./events/orderPaidConsumer');

const logger = createLogger('product-service');

async function start() {
  logger.info('Starting product-service: initializing dependencies...');
  try {
    await connectDB(mongoUri);
    logger.info('Connected to MongoDB database');
  } catch (dbErr) {
    logger.error('Failed to connect to MongoDB', dbErr);
    throw dbErr;
  }

  let rabbit;
  try {
    rabbit = await connectRabbit(rabbitUrl);
    logger.info('Connected to RabbitMQ message broker');
  } catch (rabbitErr) {
    logger.error('Failed to connect to RabbitMQ', rabbitErr);
    throw rabbitErr;
  }

  const app = express();
  app.locals.channel = rabbit.channel;

  // 1. Correlation tracking
  app.use(correlationMiddleware);

  // 2. API Telemetry with swagger-stats
  app.use(createTelemetryMiddleware('product-service'));

  // 3. CORS & Parsing
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json());

  // 4. Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.originalUrl}`, {
      correlationId: req.correlationId,
      method: req.method,
      path: req.originalUrl,
    });
    next();
  });

  app.get('/health', (req, res) => res.json({ service: 'product-service', ok: true }));
  app.use('/api/products', productRoutes);

  try {
    await registerOrderPaidConsumer(rabbit.channel);
    logger.info('Registered order.paid consumer on RabbitMQ');
  } catch (consumerErr) {
    logger.error('Failed to register order.paid consumer', consumerErr);
    throw consumerErr;
  }

  // 5. Centralized Error Handler
  app.use(createErrorHandler(logger));

  const server = app.listen(port, () => {
    logger.info(`Product service running on ${port}`);
  });

  const shutdown = (signal) => {
    logger.info(`Received ${signal}, shutting down product-service gracefully...`);
    server.close(() => {
      logger.info('Product service HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, server };
}

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception in product-service', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error(
    'Unhandled Rejection in product-service',
    reason instanceof Error ? reason : new Error(String(reason))
  );
});

if (require.main === module) {
  start().catch((error) => {
    logger.error('Product service failed to start', error);
    process.exit(1);
  });
}

module.exports = { start, logger };

