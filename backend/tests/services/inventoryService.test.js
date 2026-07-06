'use strict';

/**
 * inventoryService — Unit Tests (TDD Red Phase)
 * Written BEFORE the service is implemented.
 * All tests should FAIL until inventoryService.js is built.
 */

const mongoose = require('mongoose');
const Product = require('../../models/product.model');
const { checkStock, decrementStock } = require('../../services/inventoryService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createProduct = async (stock = 10, overrides = {}) => new Product({
    name: 'Inventory Test Product',
    description: 'Used as a fixture in inventory service tests.',
    price: 9.99,
    category: 'test',
    stock,
    ...overrides,
  }).save();

// ─── checkStock ───────────────────────────────────────────────────────────────

describe('inventoryService.checkStock', () => {
  it('does not throw when stock exactly equals requested quantity', async () => {
    const product = await createProduct(5);
    await expect(checkStock(product._id, 5)).resolves.not.toThrow();
  });

  it('does not throw when stock is greater than requested quantity', async () => {
    const product = await createProduct(20);
    await expect(checkStock(product._id, 3)).resolves.not.toThrow();
  });

  it('throws when requested quantity exceeds available stock', async () => {
    const product = await createProduct(3);
    await expect(checkStock(product._id, 10)).rejects.toThrow();
  });

  it('throws with an "insufficient stock" message', async () => {
    const product = await createProduct(2);
    await expect(checkStock(product._id, 5)).rejects.toThrow(/insufficient stock/i);
  });

  it('throws when stock is 0', async () => {
    const product = await createProduct(0);
    await expect(checkStock(product._id, 1)).rejects.toThrow(/insufficient stock/i);
  });

  it('throws when quantity is 0', async () => {
    const product = await createProduct(10);
    await expect(checkStock(product._id, 0)).rejects.toThrow();
  });

  it('throws when quantity is negative', async () => {
    const product = await createProduct(10);
    await expect(checkStock(product._id, -1)).rejects.toThrow();
  });

  it('throws when productId does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    await expect(checkStock(nonExistentId, 1)).rejects.toThrow(/not found/i);
  });

  it('returns the product when stock is sufficient', async () => {
    const product = await createProduct(15);
    const result = await checkStock(product._id, 5);
    expect(result).toBeDefined();
    expect(result._id.toString()).toBe(product._id.toString());
  });
});

// ─── decrementStock ───────────────────────────────────────────────────────────

describe('inventoryService.decrementStock', () => {
  it('reduces stock by the exact requested quantity', async () => {
    const product = await createProduct(10);
    await decrementStock(product._id, 4);

    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(6);
  });

  it('reduces stock to zero when quantity equals stock', async () => {
    const product = await createProduct(5);
    await decrementStock(product._id, 5);

    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(0);
  });

  it('returns the updated product document', async () => {
    const product = await createProduct(8);
    const updated = await decrementStock(product._id, 3);

    expect(updated).toBeDefined();
    expect(updated.stock).toBe(5);
  });

  it('throws when requested quantity exceeds available stock', async () => {
    const product = await createProduct(2);
    await expect(decrementStock(product._id, 5)).rejects.toThrow(/insufficient stock/i);
  });

  it('does not modify stock when decrement would result in negative stock', async () => {
    const product = await createProduct(3);

    await expect(decrementStock(product._id, 10)).rejects.toThrow();

    // Stock must remain unchanged after the failed decrement
    const unchanged = await Product.findById(product._id);
    expect(unchanged.stock).toBe(3);
  });

  it('throws when productId does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    await expect(decrementStock(nonExistentId, 1)).rejects.toThrow(/not found/i);
  });

  it('throws when quantity is 0', async () => {
    const product = await createProduct(10);
    await expect(decrementStock(product._id, 0)).rejects.toThrow();
  });

  it('throws when quantity is negative', async () => {
    const product = await createProduct(10);
    await expect(decrementStock(product._id, -2)).rejects.toThrow();
  });

  it('handles concurrent decrements atomically — stock never goes below 0', async () => {
    // Both calls request 8 from a stock of 10 — only one should succeed
    const product = await createProduct(10);

    const results = await Promise.allSettled([
      decrementStock(product._id, 8),
      decrementStock(product._id, 8),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const final = await Product.findById(product._id);
    expect(final.stock).toBe(2); // 10 - 8 = 2, not 10 - 8 - 8 = -6
    expect(final.stock).toBeGreaterThanOrEqual(0);
  });
});
