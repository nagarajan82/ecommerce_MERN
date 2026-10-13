const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { port, mongoUri, rabbitUrl, frontendOrigin } = require('./config/env');
const { connectRabbit } = require('@repo/event-bus');
const authRoutes = require('./routes/authRoutes');

async function start() {
  await connectDB(mongoUri);

  const rabbit = await connectRabbit(rabbitUrl);

  const app = express();
  app.locals.channel = rabbit.channel;

  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json());

  app.use((req, res, next) => {
    console.log('[USER SERVICE]', req.method, req.originalUrl);
    next();
  });

  app.get('/health', (req, res) =>
    res.json({ service: 'user-service', ok: true })
  );
  app.use('/api/auth', authRoutes);

  app.listen(port, () => {
    console.log(`User service running on ${port}`);
  });
}

start().catch((error) => {
  console.error('User service failed to start', error);
  process.exit(1);
});
