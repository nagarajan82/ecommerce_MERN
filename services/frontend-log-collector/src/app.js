const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/env');
const healthRoutes = require('./routes/health');
const logsRoutes = require('./routes/logs');

const app = express();

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);

    if (config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Bounded JSON body parser (100kb max)
app.use(express.json({ limit: '100kb' }));

// Handle JSON parsing errors safely
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Validation failed',
      details: ['Malformed JSON payload']
    });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large',
      details: ['Request body exceeded maximum allowed limit of 100kb']
    });
  }
  if (err && err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      error: 'Forbidden',
      details: ['Origin not permitted by CORS policy']
    });
  }
  next(err);
});

// Routes
app.use(healthRoutes);
app.use('/api', logsRoutes);

// 404 Not Found handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[UNHANDLED COLLECTOR ERROR]', err.message || 'Unknown internal error');
  res.status(500).json({
    error: 'Internal Server Error'
  });
});

module.exports = app;
