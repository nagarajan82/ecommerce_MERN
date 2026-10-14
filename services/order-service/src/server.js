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
const orderRoutes = require('./routes/orderRoutes');
const { registerPaymentConsumer } = require('./events/paymentConsumer');

const logger = createLogger('order-service');

async function start() {
  logger.info('Starting order-service: initializing dependencies...');
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
  app.use(createTelemetryMiddleware('order-service'));

  // 3. Security and body parsers
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json());

  // 4. Routes
  app.get('/health', (req, res) => res.json({ service: 'order-service', ok: true }));
  app.use('/api/orders', orderRoutes);

  // 5. Centralized Error Handler
  app.use(createErrorHandler(logger));

  try {
    await registerPaymentConsumer(rabbit.channel);
    logger.info('Payment consumer registered successfully');
  } catch (consumerErr) {
    logger.error('Failed to register payment consumer', consumerErr);
    throw consumerErr;
  }

  const server = app.listen(port, () => {
    logger.info(`Order service running on port ${port}`, {
      port,
      environment: process.env.NODE_ENV || 'development',
    });
  });

  const shutdown = (signal) => {
    logger.info(`Received ${signal}. Gracefully shutting down order-service...`);
    server.close(() => {
      logger.info('Order service HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, server };
}

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception in order-service', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error(
    'Unhandled Rejection in order-service',
    reason instanceof Error ? reason : new Error(String(reason))
  );
});

if (require.main === module) {
  start().catch((error) => {
    logger.error('Order service failed to start', error);
    process.exit(1);
  });
}

module.exports = { start, logger };
