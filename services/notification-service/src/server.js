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
const { registerNotificationConsumer } = require('./events/notificationConsumer');
const notificationRoutes = require('./routes/notificationRoutes');

const logger = createLogger('notification-service');

async function start() {
  logger.info('Starting notification-service: initializing dependencies...');
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
  app.use(createTelemetryMiddleware('notification-service'));

  // 3. Security and body parsers
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json());

  // 4. Routes
  app.get('/health', (req, res) => res.json({ service: 'notification-service', ok: true }));
  app.use('/api/notifications', notificationRoutes);

  // 5. Centralized Error Handler
  app.use(createErrorHandler(logger));

  try {
    await registerNotificationConsumer(rabbit.channel);
    logger.info('Notification consumer registered successfully');
  } catch (consumerErr) {
    logger.error('Failed to register notification consumer', consumerErr);
    throw consumerErr;
  }

  const server = app.listen(port, () => {
    logger.info(`Notification service running on port ${port}`, {
      port,
      environment: process.env.NODE_ENV || 'development',
    });
  });

  const shutdown = (signal) => {
    logger.info(`Received ${signal}. Gracefully shutting down notification-service...`);
    server.close(() => {
      logger.info('Notification service HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, server };
}

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception in notification-service', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error(
    'Unhandled Rejection in notification-service',
    reason instanceof Error ? reason : new Error(String(reason))
  );
});

if (require.main === module) {
  start().catch((error) => {
    logger.error('Notification service failed to start', error);
    process.exit(1);
  });
}

module.exports = { start, logger };
