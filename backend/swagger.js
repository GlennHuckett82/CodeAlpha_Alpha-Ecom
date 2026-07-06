'use strict';

/**
 * swagger.js — OpenAPI 3.0 spec generator for the Alpha E-com API.
 *
 * The top-level definition (info, servers, reusable components) is declared
 * here. Endpoint paths are sourced from @openapi JSDoc comments in every
 * file under routes/. swagger-jsdoc merges the two at require-time.
 *
 * Exposed at:
 *   GET /api/docs      — Swagger UI (interactive browser)
 *   GET /api/docs.json — raw JSON spec for tooling (Postman, Insomnia, etc.)
 */

const path        = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

// ─── Reusable schema definitions ─────────────────────────────────────────────

const schemas = {
  // ── Domain objects ──────────────────────────────────────────────────────────
  Product: {
    type: 'object',
    properties: {
      _id:         { type: 'string', example: '64a1f2c3e4b05d8f9a0b1c2d' },
      name:        { type: 'string', example: 'Wireless Noise-Cancelling Headphones' },
      description: { type: 'string', example: 'Premium audio with active noise cancellation.' },
      price:       { type: 'number', format: 'float', example: 79.99 },
      category: {
        type: 'string',
        enum: ['electronics', 'clothing', 'sports', 'books'],
        example: 'electronics',
      },
      stock:    { type: 'integer', minimum: 0, example: 50 },
      imageUrl: { type: 'string', example: 'https://example.com/headphones.jpg' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Address: {
    type: 'object',
    required: ['street', 'city', 'postcode', 'country'],
    properties: {
      street:   { type: 'string', example: '42 Playwright Avenue' },
      city:     { type: 'string', example: 'London' },
      postcode: { type: 'string', example: 'SW1A 1AA' },
      country:  { type: 'string', example: 'United Kingdom' },
    },
  },

  CartItem: {
    type: 'object',
    properties: {
      _id:       { type: 'string', example: '64a1f2c3e4b05d8f9a0b1c2e' },
      productId: { $ref: '#/components/schemas/Product' },
      quantity:  { type: 'integer', minimum: 1, example: 2 },
    },
  },

  Cart: {
    type: 'object',
    properties: {
      _id:       { type: 'string', example: '64a1f2c3e4b05d8f9a0b1c2f' },
      sessionId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-ab12-cd34ef56gh78' },
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/CartItem' },
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  OrderItem: {
    type: 'object',
    properties: {
      productId:       { type: 'string', example: '64a1f2c3e4b05d8f9a0b1c2d' },
      quantity:        { type: 'integer', minimum: 1, example: 2 },
      priceAtPurchase: { type: 'number', format: 'float', example: 79.99 },
    },
  },

  Order: {
    type: 'object',
    properties: {
      _id:       { type: 'string', example: '64a1f2c3e4b05d8f9a0b1c30' },
      sessionId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-ab12-cd34ef56gh78' },
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/OrderItem' },
      },
      totalAmount:     { type: 'number', format: 'float', example: 159.98 },
      shippingAddress: { $ref: '#/components/schemas/Address' },
      status: {
        type: 'string',
        enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
        example: 'confirmed',
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  UserPublic: {
    type: 'object',
    properties: {
      id:    { type: 'string', example: '64a1f2c3e4b05d8f9a0b1c31' },
      email: { type: 'string', format: 'email', example: 'shopper@example.com' },
    },
  },

  // ── Generic wrappers ────────────────────────────────────────────────────────
  Error: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error:   { type: 'string', example: 'Resource not found' },
    },
  },

  ValidationErrors: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type:     { type: 'string', example: 'field' },
            msg:      { type: 'string', example: 'price must be a positive number' },
            path:     { type: 'string', example: 'price' },
            location: { type: 'string', example: 'body' },
          },
        },
      },
    },
  },
};

// ─── Reusable response definitions ───────────────────────────────────────────

const responses = {
  ValidationError: {
    description: 'Unprocessable Entity — request validation failed.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ValidationErrors' },
      },
    },
  },
  NotFound: {
    description: 'Not Found — the requested resource does not exist.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: { success: false, error: 'Resource not found' },
      },
    },
  },
  Unauthorized: {
    description: 'Unauthorized — missing or invalid JWT Bearer token.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: { success: false, error: 'No token provided' },
      },
    },
  },
  Forbidden: {
    description: 'Forbidden — caller lacks the required privileges.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: { success: false, error: 'Unauthorized' },
      },
    },
  },
  InternalError: {
    description: 'Internal Server Error.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: { success: false, error: 'Something went wrong' },
      },
    },
  },
};

// ─── Top-level OpenAPI definition ─────────────────────────────────────────────

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'Alpha E-com API',
    version: '1.0.0',
    description:
      'REST API for the Alpha e-commerce store. Serves products, shopping cart, '
      + 'order fulfilment, and authentication.\n\n'
      + '**Auth:** Protected endpoints (`POST /api/orders`, `GET /api/orders/:id`) '
      + 'require a `Bearer <JWT>` token obtained from `POST /api/auth/login`.\n\n'
      + '**Admin:** `DELETE /api/admin/cache` requires an `x-admin-key` header.\n\n'
      + '**Docs access:** The Swagger UI is always available in development. '
      + 'In production it requires the same `x-admin-key` header.',
    contact: {
      name: 'Alpha E-com on GitHub',
      url: 'https://github.com/GlennHuckett82/alpha-ecom',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local development' },
    { url: 'https://alpha-ecom-api.onrender.com', description: 'Production (Render)' },
  ],
  tags: [
    { name: 'Health',   description: 'Service health and liveness probes' },
    { name: 'Products', description: 'Product catalogue (public, cached)' },
    { name: 'Cart',     description: 'Session-based shopping cart' },
    { name: 'Orders',   description: 'Order placement and retrieval (JWT required)' },
    { name: 'Auth',     description: 'User registration and login' },
    { name: 'Admin',    description: 'Administrative operations (x-admin-key required)' },
  ],
  // Health check paths live in server.js, not in a routes/ file, so they are
  // defined directly here rather than via @openapi JSDoc comments.
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description:
          'Returns 200 when the server process is running. '
          + 'Used as the Render `healthCheckPath`. '
          + 'Registered before the rate-limiter — monitoring pings never consume quota.',
        operationId: 'getHealth',
        responses: {
          200: {
            description: 'Service is up.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    env:    { type: 'string', example: 'development' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe (API-prefixed alias)',
        description: 'Identical to `GET /health`. Convenient for API consumers and uptime monitors.',
        operationId: 'getApiHealth',
        responses: {
          200: { $ref: '#/paths/~1health/get/responses/200' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT obtained from `POST /api/auth/login`. Expires in 24 h.',
      },
      AdminKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-admin-key',
        description: 'Must match the `ADMIN_KEY` environment variable.',
      },
    },
    schemas,
    responses,
  },
};

const options = {
  definition,
  // Scan all route files for @openapi JSDoc comments.
  // Use forward slashes explicitly — swagger-jsdoc's glob library requires
  // POSIX-style paths even on Windows (path.join uses backslashes on Windows).
  apis: [`${__dirname.replace(/\\/g, '/')}/routes/*.js`],
};

module.exports = swaggerJsdoc(options);
