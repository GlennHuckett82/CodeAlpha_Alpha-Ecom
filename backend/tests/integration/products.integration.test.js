'use strict';

/**
 * Integration tests — Product Catalog
 *
 * Tests the complete chain: HTTP request → Express route → Mongoose query →
 * response shape, using Supertest against the real Express app and an
 * in-memory MongoDB instance.
 *
 * DB lifecycle (connect, afterEach wipe, disconnect) is owned by
 * tests/jest.setup.js — nothing to set up here beyond seeding.
 */

const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../../server');
const Product  = require('../../models/product.model');

// ─── Seed helpers ─────────────────────────────────────────────────────────────

// 15-entry category map: 5 each of electronics / clothing / books
const SEED_CATEGORIES = [
  ...Array(5).fill('electronics'),
  ...Array(5).fill('clothing'),
  ...Array(5).fill('books'),
];

const makeProduct = (overrides = {}) => ({
  name:        'Integration Product',
  description: 'A product created for integration testing.',
  price:       14.99,
  category:    'electronics',
  stock:       25,
  imageUrl:    'https://example.com/int-test.webp',
  ...overrides,
});

/**
 * Inserts `count` products (default 15) with evenly spread categories.
 * Returns the array of inserted Mongoose documents.
 */
const seedProducts = async (count = 15) => {
  const docs = Array.from({ length: count }, (_, i) =>
    makeProduct({
      name:     `Integration Product ${i + 1}`,
      category: SEED_CATEGORIES[i] ?? 'electronics',
    }),
  );
  return Product.insertMany(docs);
};

// ─── One-time DB setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  // Text + compound indexes must exist before full-text search tests can pass
  await Product.createIndexes();
});

// ─── GET /api/products — default listing ──────────────────────────────────────

describe('Integration: GET /api/products — 15-product dataset', () => {
  beforeEach(async () => {
    await seedProducts(15); // 5 electronics · 5 clothing · 5 books
  });

  it('returns 200 with success:true and exactly 12 products (default limit)', async () => {
    const res = await request(app).get('/api/products?page=1');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(12);
  });

  it('every product in the response carries all required fields', async () => {
    const res = await request(app).get('/api/products?page=1');

    res.body.data.forEach((p) => {
      expect(p).toHaveProperty('_id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('description');
      expect(p).toHaveProperty('price');
      expect(p).toHaveProperty('category');
      expect(p).toHaveProperty('stock');
    });
  });

  it('pagination object correctly reflects the full 15-document dataset', async () => {
    const res = await request(app).get('/api/products?page=1');
    const { pagination } = res.body;

    expect(pagination.total).toBe(15);
    expect(pagination.totalPages).toBe(2);
    expect(pagination.page).toBe(1);
    expect(pagination.hasNextPage).toBe(true);
    expect(pagination.hasPrevPage).toBe(false);
  });

  it('page 2 returns the remaining 3 products and marks hasPrevPage:true', async () => {
    const res = await request(app).get('/api/products?page=2');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.hasPrevPage).toBe(true);
    expect(res.body.pagination.hasNextPage).toBe(false);
  });
});

// ─── GET /api/products?category=X ─────────────────────────────────────────────

describe('Integration: GET /api/products?category=X — category filtering', () => {
  beforeEach(async () => {
    await seedProducts(15); // 5 electronics · 5 clothing · 5 books
  });

  it('returns only the 5 electronics products', async () => {
    const res = await request(app).get('/api/products?category=electronics&page=1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(5);
    res.body.data.forEach((p) => expect(p.category).toBe('electronics'));
  });

  it('category filter is case-insensitive (ELECTRONICS → 5 results)', async () => {
    const res = await request(app).get('/api/products?category=ELECTRONICS&page=1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(5);
  });

  it('pagination.total reflects only the matching-category count, not total products', async () => {
    const res = await request(app).get('/api/products?category=clothing&page=1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination.total).toBe(5); // 5 clothing, not 15 total
  });

  it('returns an empty data array for a category with no products', async () => {
    const res = await request(app).get('/api/products?category=nonexistent-category&page=1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });
});

// ─── GET /api/products/:id ─────────────────────────────────────────────────────

describe('Integration: GET /api/products/:id', () => {
  let product;

  beforeEach(async () => {
    [product] = await Product.insertMany([
      makeProduct({ name: 'Specific Product', price: 49.99, category: 'books', stock: 7 }),
    ]);
  });

  it('returns 200 with the complete product document for a valid, existing ID', async () => {
    const res = await request(app).get(`/api/products/${product._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data._id).toBe(product._id.toString());
    expect(data.name).toBe('Specific Product');
    expect(data.price).toBe(49.99);
    expect(data.category).toBe('books');
    expect(data.stock).toBe(7);
  });

  it('returns 404 with an error message for a valid ObjectId that does not exist', async () => {
    const ghostId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/products/${ghostId}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 422 for a syntactically invalid (non-ObjectId) ID string', async () => {
    const res = await request(app).get('/api/products/not-a-valid-id');

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
  });
});
