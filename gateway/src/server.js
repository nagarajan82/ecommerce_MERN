require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const {
  createProxyMiddleware,
  fixRequestBody,
} = require('http-proxy-middleware');

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

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Keep JSON parsing only if you truly need it in gateway-level handlers.
// Since we verify JWT from headers only, this is safe to remove for simpler proxying.
// app.use(express.json());

app.use((req, res, next) => {
  console.log('[GATEWAY]', req.method, req.originalUrl);
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
      proxyReq: fixRequestBody,
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Gateway running on ${PORT}`);
    console.log('Proxy targets:', services);
  });
}

module.exports = {
  app,
  attachUser,
  requireAuth,
  proxyWithPrefix,
  services,
};
