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
const paymentRoutes = require('./routes/paymentRoutes');

const logger = createLogger('payment-service');

async function start() {
  logger.info('Starting payment-service: initializing dependencies...');
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
  app.use(createTelemetryMiddleware('payment-service'));

  // 3. Security and body parsers
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json());

  // 4. Routes
  app.get('/health', (req, res) => res.json({ service: 'payment-service', ok: true }));
  app.use('/api/payments', paymentRoutes);

  // 5. Centralized Error Handler
  app.use(createErrorHandler(logger));

  const server = app.listen(port, () => {
    logger.info(`Payment service running on port ${port}`, {
      port,
      environment: process.env.NODE_ENV || 'development',
    });
  });

  const shutdown = (signal) => {
    logger.info(`Received ${signal}. Gracefully shutting down payment-service...`);
    server.close(() => {
      logger.info('Payment service HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, server };
}

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception in payment-service', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error(
    'Unhandled Rejection in payment-service',
    reason instanceof Error ? reason : new Error(String(reason))
  );
});

if (require.main === module) {
  start().catch((error) => {
    logger.error('Payment service failed to start', error);
    process.exit(1);
  });
}

module.exports = { start, logger };
