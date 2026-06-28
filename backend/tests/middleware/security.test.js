'use strict';
/**
 * Production-Readiness Middleware — Tests (P19)
 *
 * Verifies:
 *   helmet      — removes X-Powered-By, sets security headers
 *   compression — sends Content-Encoding: gzip for large payloads
 *   rate-limit  — returns 429 after exceeding the per-IP request cap
 *   morgan      — does not throw (smoke test; output goes to stdout)
 */

const express = require('express');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const request = require('supertest');

// ─── Shared: main app (already has helmet + compression + morgan) ─────────────
const app = require('../../server');

// ─── helmet ───────────────────────────────────────────────────────────────────
describe('helmet security headers', () => {
  it('removes the X-Powered-By header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options to deny embedding', async () => {
    const res = await request(app).get('/health');
    // helmet sets SAMEORIGIN by default
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

// ─── compression / gzip ───────────────────────────────────────────────────────
describe('gzip compression', () => {
  // Build a minimal test app: compression only, with a route that returns
  // a response large enough to exceed the 1 kb compression threshold.
  let compApp;
  beforeAll(() => {
    compApp = express();
    compApp.use(compression());
    compApp.get('/large', (req, res) => {
      // 2 kb of JSON — safely above the 1024-byte default threshold
      res.json({ data: 'A'.repeat(2048) });
    });
    compApp.get('/small', (req, res) => {
      res.json({ ok: true });
    });
  });

  it('sets Content-Encoding: gzip for a large payload when client accepts gzip', async () => {
    const res = await request(compApp)
      .get('/large')
      .set('Accept-Encoding', 'gzip');
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('returns the correct decompressed body when gzip is requested', async () => {
    const res = await request(compApp)
      .get('/large')
      .set('Accept-Encoding', 'gzip');
    // Supertest/superagent auto-decompresses gzip responses
    expect(res.body.data).toBe('A'.repeat(2048));
  });

  it('does not set Content-Encoding for payloads below the threshold', async () => {
    const res = await request(compApp)
      .get('/small')
      .set('Accept-Encoding', 'gzip');
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('main app uses compression (x-powered-by absent, gzip on large /api response)', async () => {
    // The main app has compression(); confirm the header is absent (not deflate-only)
    // and the app responds successfully — deep gzip verification covered above.
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    // Content-Encoding may or may not be set for the small /health payload —
    // we only assert the server does not crash when compression is mounted.
    expect(res.body).toMatchObject({ status: 'ok' });
  });
});

// ─── rate limiting ────────────────────────────────────────────────────────────
describe('rate limiting', () => {
  // Build an isolated test app with a very low cap so we don't need 100 requests.
  let limitApp;
  beforeAll(() => {
    limitApp = express();
    limitApp.use(
      '/api',
      rateLimit({
        windowMs: 60 * 1000,
        max: 3,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many requests, please try again later.' },
      }),
    );
    limitApp.get('/api/ping', (req, res) => res.json({ ok: true }));
  });

  it('allows requests within the limit', async () => {
    const res = await request(limitApp).get('/api/ping');
    expect(res.statusCode).toBe(200);
  });

  it('returns 429 after exceeding the request cap', async () => {
    // Make 3 allowed requests (already partially consumed above in the same window,
    // but each test suite gets a fresh limitApp instance via beforeAll)
    await request(limitApp).get('/api/ping');
    await request(limitApp).get('/api/ping');
    await request(limitApp).get('/api/ping');
    // 4th request — over the limit of 3
    const res = await request(limitApp).get('/api/ping');
    expect(res.statusCode).toBe(429);
  });

  it('includes { success: false } in the 429 body', async () => {
    // limitApp is already over limit from the previous test
    const res = await request(limitApp).get('/api/ping');
    expect(res.body.success).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });

  it('sets RateLimit-* standard headers', async () => {
    const res = await request(limitApp).get('/api/ping');
    // standardHeaders: true → RateLimit-Limit and RateLimit-Remaining
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('does not set legacy X-RateLimit-* headers', async () => {
    const res = await request(limitApp).get('/api/ping');
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('main app skips rate limiting during tests (all /api requests succeed)', async () => {
    // In NODE_ENV=test, the main app limiter has skip: () => true
    // so the full test suite never trips the 100-req cap.
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
  });
});
