'use strict';

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path'); // Node built-in — needed for static file serving

const app = express();

// ─── Security & Utility Middleware ───────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.CORS_ORIGIN || 'http://localhost:5500')
      .split(',')
      .map((o) => o.trim());
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      const err = new Error('Not allowed by CORS');
      err.statusCode = 403;
      callback(err);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10kb' }));

// ─── Health checks ────────────────────────────────────────────────────────────
// Registered BEFORE the rate-limiter so monitoring pings do not consume quota.
// /health      — Render healthCheckPath (plain path, outside /api prefix)
// /api/health  — convenience alias for API consumers / uptime monitors
function healthHandler(req, res) {
  res.status(200).json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
}
app.get('/health',     healthHandler);
app.get('/api/health', healthHandler);

// ─── API Documentation ────────────────────────────────────────────────────────
// Swagger UI at GET /api/docs   — interactive browser (NODE_ENV !== 'production'
//                                 OR x-admin-key matches ADMIN_KEY env var)
// Raw JSON spec at GET /api/docs.json — for Postman / Insomnia import
//
// swagger-jsdoc parses ~5 route files on first load (~600 ms).
// We lazy-load it so tests that never hit /api/docs don't pay the cost.
//
// Registered BEFORE the rate-limiter so browsing the docs never consumes quota.
const swaggerUi = require('swagger-ui-express');

function docsGuard(req, res, next) {
  // Always accessible in non-production environments (dev, test, staging)
  if (process.env.NODE_ENV !== 'production') return next();
  // In production: require x-admin-key to match ADMIN_KEY
  const adminKey = process.env.ADMIN_KEY;
  if (adminKey && req.headers['x-admin-key'] === adminKey) return next();
  return res.status(403).json({
    success: false,
    error: 'API docs are restricted in production — provide a valid x-admin-key header.',
  });
}

// Lazy-loaded: spec only parsed on first request to /api/docs or /api/docs.json
let _spec = null;
let _swaggerSetup = null;
function getSpec() {
  if (!_spec) _spec = require('./swagger');
  return _spec;
}

app.get('/api/docs.json', docsGuard, (req, res) => res.json(getSpec()));
app.use(
  '/api/docs',
  docsGuard,
  swaggerUi.serve,
  (req, res, next) => {
    if (!_swaggerSetup) {
      _swaggerSetup = swaggerUi.setup(getSpec(), {
        customSiteTitle: 'Alpha E-com API Docs',
        // Hide the default Swagger UI topbar (redundant when embedded)
        customCss: '.swagger-ui .topbar { display: none }',
        swaggerOptions: {
          // Collapse all operations by default for cleaner first impression
          docExpansion: 'none',
          persistAuthorization: true,
        },
      });
    }
    return _swaggerSetup(req, res, next);
  },
);

// ─── Rate Limiting ─────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,   // Return rate-limit info in RateLimit-* headers
  legacyHeaders: false,    // Disable X-RateLimit-* headers
  message: { success: false, error: 'Too many requests, please try again later.' },
  // Skip rate limiting during automated tests so the suite never trips the limit
  skip: () => process.env.NODE_ENV === 'test',
});

// ─── Response Cache ──────────────────────────────────────────────────────────
const { createCache } = require('./middleware/cache');
const productCache = createCache(60); // 60-second TTL

// ─── Static Files (frontend) ────────────────────────────────────────
// Cache-Control strategy for static assets:
//  • HTML  → no-cache  (always revalidate — shell may change on each deploy)
//  • CSS/JS → public, max-age=31536000, immutable (1-year; URLs carry ?v=hash)
app.use(
  express.static(path.join(__dirname, '..', 'frontend'), {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

// ─── Routes ─────────────────────────────────────────────────────────
app.use('/api', apiLimiter);
// Set Cache-Control for public product GET responses before the server-side
// cache so the header is present on both cached and freshly-fetched replies.
app.use('/api/products', (req, res, next) => {
  if (req.method === 'GET') res.setHeader('Cache-Control', 'public, max-age=60');
  next();
});
app.use('/api/products', productCache, require('./routes/products'));
app.use('/api/cart',     require('./routes/cart'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/admin',    require('./routes/admin'));

// ─── Error Handling ───────────────────────────────────────────────────────────
const { notFoundHandler, validationErrorHandler, generalErrorHandler } = require('./middleware/errorHandler');
app.use(notFoundHandler);
app.use(validationErrorHandler);
app.use(generalErrorHandler);

// ─── Database Connection ──────────────────────────────────────────────────────
const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not defined in environment variables');
  await mongoose.connect(uri);
  console.log('MongoDB connected');
};

// ─── Server Bootstrap ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// Export app before listen so Supertest can import without starting the server
module.exports = app;

if (require.main === module) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });
}
