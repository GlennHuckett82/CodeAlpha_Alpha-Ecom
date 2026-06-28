'use strict';

/**
 * Cart Model — Unit Tests (TDD Red Phase)
 * These tests are written BEFORE the model is implemented (P9).
 * All tests should FAIL until the Mongoose schema is built in P9.
 */

const mongoose = require('mongoose');
const Cart = require('../../models/cart.model');
const Product = require('../../models/product.model');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates and saves a real Product document so cart items have a
 * valid ObjectId ref. The Product model is already implemented (P7).
 */
const createProduct = async (overrides = {}) => {
  const product = new Product({
    name: 'Test Product',
    description: 'A product used as a fixture in cart tests.',
    price: 19.99,
    category: 'test',
    stock: 50,
    ...overrides,
  });
  return product.save();
};

/** Returns a plain object representing a valid cart document */
const validCartData = (productId) => ({
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  items: [{ productId, quantity: 2 }],
});

/**
 * Saves a Mongoose document and returns the validation error,
 * or null if the save succeeded.
 */
const getValidationError = async (doc) => {
  try {
    await doc.save();
    return null;
  } catch (err) {
    return err;
  }
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Cart Model', () => {
  let productId;

  // Create one shared product fixture before all tests
  beforeAll(async () => {
    const product = await createProduct();
    productId = product._id;
  });

  // ── Valid document ────────────────────────────────────────────────────────

  describe('valid cart', () => {
    it('saves successfully with a sessionId and one item', async () => {
      const cart = new Cart(validCartData(productId));
      const saved = await cart.save();

      expect(saved._id).toBeDefined();
      expect(mongoose.Types.ObjectId.isValid(saved._id)).toBe(true);
      expect(saved.sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(saved.items).toHaveLength(1);
      expect(saved.items[0].productId.toString()).toBe(productId.toString());
      expect(saved.items[0].quantity).toBe(2);
    });

    it('saves successfully with an empty items array', async () => {
      const cart = new Cart({
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        items: [],
      });
      const saved = await cart.save();

      expect(saved.items).toHaveLength(0);
    });
  });

  // ── Required field: sessionId ─────────────────────────────────────────────

  describe('sessionId validation', () => {
    it('fails validation when sessionId is missing', async () => {
      const cart = new Cart({ items: [{ productId, quantity: 1 }] });
      const err = await getValidationError(cart);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('sessionId');
    });

    it('fails validation when sessionId is an empty string', async () => {
      const cart = new Cart({ sessionId: '', items: [{ productId, quantity: 1 }] });
      const err = await getValidationError(cart);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('sessionId');
    });

    it('enforces uniqueness — two carts cannot share the same sessionId', async () => {
      const sharedSession = 'unique-test-session-id-12345678';
      await new Cart({ sessionId: sharedSession, items: [] }).save();

      const duplicate = new Cart({ sessionId: sharedSession, items: [] });
      const err = await getValidationError(duplicate);

      expect(err).not.toBeNull();
      // MongoDB duplicate key error code
      expect(err.code).toBe(11000);
    });
  });

  // ── Item: productId ───────────────────────────────────────────────────────

  describe('item productId validation', () => {
    it('fails validation when an item is missing productId', async () => {
      const cart = new Cart({
        sessionId: 'session-no-productid-0000000000',
        items: [{ quantity: 1 }],
      });
      const err = await getValidationError(cart);

      expect(err).not.toBeNull();
      // Mongoose stores subdocument errors as literal dot-key strings;
      // use bracket notation — toHaveProperty splits on '.' as a path separator
      expect(err.errors['items.0.productId']).toBeDefined();
    });

    it('fails validation when productId is not a valid ObjectId', async () => {
      const cart = new Cart({
        sessionId: 'session-bad-objectid-000000000000',
        items: [{ productId: 'not-a-valid-object-id', quantity: 1 }],
      });
      const err = await getValidationError(cart);

      expect(err).not.toBeNull();
      expect(err.errors['items.0.productId']).toBeDefined();
    });

    it('accepts a valid ObjectId as productId even if the product does not exist', async () => {
      // Referential integrity is enforced at the service layer, not the schema layer
      const fakeId = new mongoose.Types.ObjectId();
      const cart = new Cart({
        sessionId: 'session-fake-ref-00000000000000',
        items: [{ productId: fakeId, quantity: 1 }],
      });
      const saved = await cart.save();

      expect(saved.items[0].productId.toString()).toBe(fakeId.toString());
    });
  });

  // ── Item: quantity ────────────────────────────────────────────────────────

  describe('item quantity validation', () => {
    it('fails validation when quantity is 0', async () => {
      const cart = new Cart({
        sessionId: 'session-qty-zero-000000000000000',
        items: [{ productId, quantity: 0 }],
      });
      const err = await getValidationError(cart);

      expect(err).not.toBeNull();
      // Bracket notation required — Mongoose uses literal dot-key strings for subdocument errors
      expect(err.errors['items.0.quantity']).toBeDefined();
    });

    it('fails validation when quantity is negative', async () => {
      const cart = new Cart({
        sessionId: 'session-qty-negative-00000000000',
        items: [{ productId, quantity: -3 }],
      });
      const err = await getValidationError(cart);

      expect(err).not.toBeNull();
      expect(err.errors['items.0.quantity']).toBeDefined();
    });

    it('fails validation when quantity is missing', async () => {
      const cart = new Cart({
        sessionId: 'session-qty-missing-000000000000',
        items: [{ productId }],
      });
      const err = await getValidationError(cart);

      expect(err).not.toBeNull();
      expect(err.errors['items.0.quantity']).toBeDefined();
    });

    it('accepts quantity of 1 (minimum valid value)', async () => {
      const cart = new Cart({
        sessionId: 'session-qty-one-0000000000000000',
        items: [{ productId, quantity: 1 }],
      });
      const saved = await cart.save();

      expect(saved.items[0].quantity).toBe(1);
    });

    it('accepts large quantities', async () => {
      const cart = new Cart({
        sessionId: 'session-qty-large-00000000000000',
        items: [{ productId, quantity: 999 }],
      });
      const saved = await cart.save();

      expect(saved.items[0].quantity).toBe(999);
    });
  });

  // ── Multiple items ────────────────────────────────────────────────────────

  describe('multiple items', () => {
    it('allows multiple items in the items array', async () => {
      const product2 = await createProduct({ name: 'Second Product' });
      const product3 = await createProduct({ name: 'Third Product' });

      const cart = new Cart({
        sessionId: 'session-multi-items-0000000000000',
        items: [
          { productId, quantity: 1 },
          { productId: product2._id, quantity: 3 },
          { productId: product3._id, quantity: 2 },
        ],
      });
      const saved = await cart.save();

      expect(saved.items).toHaveLength(3);
      expect(saved.items[0].quantity).toBe(1);
      expect(saved.items[1].quantity).toBe(3);
      expect(saved.items[2].quantity).toBe(2);
    });

    it('allows the same productId to appear in multiple items (duplicate handling at service layer)', async () => {
      const cart = new Cart({
        sessionId: 'session-dup-product-00000000000000',
        items: [
          { productId, quantity: 1 },
          { productId, quantity: 4 },
        ],
      });
      const saved = await cart.save();

      expect(saved.items).toHaveLength(2);
    });
  });

  // ── Timestamps ───────────────────────────────────────────────────────────

  describe('timestamps', () => {
    it('sets updatedAt automatically on creation', async () => {
      const before = new Date();
      const cart = new Cart(validCartData(productId));
      const saved = await cart.save();
      const after = new Date();

      expect(saved.updatedAt).toBeDefined();
      expect(saved.updatedAt).toBeInstanceOf(Date);
      expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(saved.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('sets createdAt automatically on creation', async () => {
      const cart = new Cart(validCartData(productId));
      const saved = await cart.save();

      expect(saved.createdAt).toBeDefined();
      expect(saved.createdAt).toBeInstanceOf(Date);
    });

    it('updates updatedAt when the cart is modified', async () => {
      const cart = new Cart({
        sessionId: 'session-update-timestamp-0000000',
        items: [{ productId, quantity: 1 }],
      });
      const saved = await cart.save();
      const originalUpdatedAt = saved.updatedAt;

      await new Promise((resolve) => { setTimeout(resolve, 10); });

      saved.items[0].quantity = 5;
      const updated = await saved.save();

      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});
