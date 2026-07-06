'use strict';

/**
 * Cache middleware + DELETE /api/admin/cache — Supertest tests (TDD)
 *
 * Database lifecycle is managed by jest.setup.js (MongoMemoryServer,
 * collection wipe in afterEach, disconnect in afterAll).
 * This file only seeds Product documents it needs per-test.
 */

const request = require('supertest');
const express = require('express');
const Product = require('../../models/product.model');
const { createCache, flushCache } = require('../../middleware/cache');
const productsRouter = require('../../routes/products');
const adminRouter = require('../../routes/admin');

// ─── Mini-app wired with cache + admin routes ─────────────────────────────────

let app;

beforeAll(async () => {
  // Ensure text index is present so search queries don't error
  await Product.createIndexes();

  app = express();
  app.use(express.json());
  app.use('/api/products', createCache(60), productsRouter);
  app.use('/api/admin', adminRouter);
});

beforeEach(() => {
  // Start every test with a clean store (jest.setup.js also flushes in afterEach,
  // but an explicit beforeEach flush keeps intent clear)
  flushCache();
  process.env.ADMIN_KEY = 'super-secret-admin';
});

afterEach(() => {
  delete process.env.ADMIN_KEY;
});

// ─── Seed helper ──────────────────────────────────────────────────────────────

const seed = (overrides = {}) => Product.create({
    name: 'Cache Widget',
    description: 'A widget for testing the cache middleware response caching.',
    price: 9.99,
    stock: 10,
    category: 'widgets',
    ...overrides,
  });

// ─── X-Cache headers ──────────────────────────────────────────────────────────

describe('GET /api/products — X-Cache headers', () => {
  it('first request returns X-Cache: MISS', async () => {
    await seed();
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
  });

  it('second identical request returns X-Cache: HIT', async () => {
    await seed();
    await request(app).get('/api/products');
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('HIT response body is byte-for-byte identical to MISS response body', async () => {
    await seed();
    const miss = await request(app).get('/api/products');
    const hit = await request(app).get('/api/products');
    expect(hit.body).toEqual(miss.body);
  });

  it('different query strings are stored as independent cache entries', async () => {
    await seed({ name: 'Widget A', category: 'widgets' });
    await seed({ name: 'Gadget B', category: 'gadgets' });

    // Both URLs are new → both should MISS
    const r1 = await request(app).get('/api/products?category=widgets');
    const r2 = await request(app).get('/api/products?category=gadgets');
    expect(r1.headers['x-cache']).toBe('MISS');
    expect(r2.headers['x-cache']).toBe('MISS');

    // Repeat both URLs → both should HIT (independent entries)
    const r3 = await request(app).get('/api/products?category=widgets');
    const r4 = await request(app).get('/api/products?category=gadgets');
    expect(r3.headers['x-cache']).toBe('HIT');
    expect(r4.headers['x-cache']).toBe('HIT');
  });

  it('GET /api/products/:id responses are also cached', async () => {
    const product = await seed();
    await request(app).get(`/api/products/${product._id}`);
    const res = await request(app).get(`/api/products/${product._id}`);
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('non-GET methods do not receive an X-Cache header', async () => {
    const res = await request(app).post('/api/products').send({});
    // 404 from the router — important thing is no caching header
    expect(res.headers['x-cache']).toBeUndefined();
  });

  it('non-2xx responses (422 validation error) are not cached', async () => {
    // An invalid ObjectId triggers a 422 — that must never be served as a HIT
    const r1 = await request(app).get('/api/products/not-a-valid-id');
    const r2 = await request(app).get('/api/products/not-a-valid-id');
    expect(r1.status).toBe(422);
    expect(r2.status).toBe(422);
    // Both requests go through the route (MISS each time — nothing was stored)
    expect(r1.headers['x-cache']).toBe('MISS');
    expect(r2.headers['x-cache']).toBe('MISS');
  });
});

// ─── TTL expiry ───────────────────────────────────────────────────────────────

describe('Cache TTL expiry', () => {
  it('returns MISS after the TTL window has elapsed', async () => {
    // Use a very short TTL (10 ms) so we can wait it out without fake timers
    const shortApp = express();
    shortApp.use(express.json());
    shortApp.use('/api/products', createCache(0.01), productsRouter);

    await seed();

    const r1 = await request(shortApp).get('/api/products');
    expect(r1.headers['x-cache']).toBe('MISS');

    const r2 = await request(shortApp).get('/api/products');
    expect(r2.headers['x-cache']).toBe('HIT');

    // Wait 50 ms — well past the 10 ms TTL
    await new Promise((resolve) => { setTimeout(resolve, 50); });

    const r3 = await request(shortApp).get('/api/products');
    expect(r3.headers['x-cache']).toBe('MISS');
  });
});

// ─── DELETE /api/admin/cache ──────────────────────────────────────────────────

describe('DELETE /api/admin/cache', () => {
  it('returns 200 with success message and the next GET is a MISS', async () => {
    await seed();

    // Prime the cache
    await request(app).get('/api/products');
    expect((await request(app).get('/api/products')).headers['x-cache']).toBe('HIT');

    // Flush
    const flush = await request(app)
      .delete('/api/admin/cache')
      .set('x-admin-key', 'super-secret-admin');
    expect(flush.status).toBe(200);
    expect(flush.body).toEqual({ success: true, message: 'Cache flushed' });

    // Cache should now be empty
    const afterFlush = await request(app).get('/api/products');
    expect(afterFlush.headers['x-cache']).toBe('MISS');
  });

  it('returns 401 when the x-admin-key header is absent', async () => {
    const res = await request(app).delete('/api/admin/cache');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when the x-admin-key header value is incorrect', async () => {
    const res = await request(app)
      .delete('/api/admin/cache')
      .set('x-admin-key', 'totally-wrong-key');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when ADMIN_KEY is not configured in the environment', async () => {
    delete process.env.ADMIN_KEY;
    const res = await request(app)
      .delete('/api/admin/cache')
      .set('x-admin-key', 'super-secret-admin');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
  });
});
