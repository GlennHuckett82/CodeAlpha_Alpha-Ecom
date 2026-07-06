'use strict';

/**
 * pricingService — Unit Tests (TDD Red Phase)
 * Written BEFORE the service is implemented.
 * All tests should FAIL until pricingService.js is built.
 *
 * pricingService is pure business logic — no DB required.
 * Tests run without the mongodb-memory-server setup overhead.
 */

const { calculateOrderTotal, validatePrices } = require('../../services/pricingService');

// ─── calculateOrderTotal ──────────────────────────────────────────────────────

describe('pricingService.calculateOrderTotal', () => {
  it('returns 0 for an empty items array', () => {
    expect(calculateOrderTotal([])).toBe(0);
  });

  it('returns priceAtPurchase * quantity for a single item', () => {
    const items = [{ priceAtPurchase: 10.00, quantity: 3 }];
    expect(calculateOrderTotal(items)).toBe(30.00);
  });

  it('sums all items correctly for multiple items', () => {
    const items = [
      { priceAtPurchase: 10.00, quantity: 2 }, // 20.00
      { priceAtPurchase: 5.00, quantity: 4 }, // 20.00
      { priceAtPurchase: 2.50, quantity: 1 }, // 2.50
    ];
    expect(calculateOrderTotal(items)).toBe(42.50);
  });

  it('handles decimal prices accurately (rounds to 2dp)', () => {
    const items = [
      { priceAtPurchase: 0.10, quantity: 3 }, // 0.30
      { priceAtPurchase: 0.20, quantity: 3 }, // 0.60
    ];
    // 0.1 * 3 + 0.2 * 3 = 0.30 + 0.60 = 0.90 — floating point without rounding gives 0.8999...
    expect(calculateOrderTotal(items)).toBe(0.90);
  });

  it('handles a single item with quantity 1', () => {
    const items = [{ priceAtPurchase: 49.99, quantity: 1 }];
    expect(calculateOrderTotal(items)).toBe(49.99);
  });

  it('handles large quantities', () => {
    const items = [{ priceAtPurchase: 1.00, quantity: 1000 }];
    expect(calculateOrderTotal(items)).toBe(1000.00);
  });

  it('handles large prices', () => {
    const items = [{ priceAtPurchase: 999.99, quantity: 2 }];
    expect(calculateOrderTotal(items)).toBe(1999.98);
  });

  it('throws when items is not an array', () => {
    expect(() => calculateOrderTotal(null)).toThrow();
    expect(() => calculateOrderTotal(undefined)).toThrow();
  });

  it('throws when an item is missing priceAtPurchase', () => {
    const items = [{ quantity: 2 }];
    expect(() => calculateOrderTotal(items)).toThrow();
  });

  it('throws when an item is missing quantity', () => {
    const items = [{ priceAtPurchase: 10.00 }];
    expect(() => calculateOrderTotal(items)).toThrow();
  });
});

// ─── validatePrices ───────────────────────────────────────────────────────────

describe('pricingService.validatePrices', () => {
  it('does not throw when all prices are valid positive numbers', () => {
    const items = [
      { priceAtPurchase: 10.00, quantity: 1 },
      { priceAtPurchase: 0.01, quantity: 2 },
      { priceAtPurchase: 999.99, quantity: 1 },
    ];
    expect(() => validatePrices(items)).not.toThrow();
  });

  it('does not throw for an empty array', () => {
    expect(() => validatePrices([])).not.toThrow();
  });

  it('throws when any item has a price of 0', () => {
    const items = [
      { priceAtPurchase: 10.00, quantity: 1 },
      { priceAtPurchase: 0, quantity: 1 },
    ];
    expect(() => validatePrices(items)).toThrow();
  });

  it('throws with an informative message when price is 0', () => {
    const items = [{ priceAtPurchase: 0, quantity: 1 }];
    expect(() => validatePrices(items)).toThrow(/invalid price/i);
  });

  it('throws when any item has a negative price', () => {
    const items = [{ priceAtPurchase: -5.00, quantity: 1 }];
    expect(() => validatePrices(items)).toThrow(/invalid price/i);
  });

  it('throws when any item is missing priceAtPurchase entirely', () => {
    const items = [{ quantity: 2 }];
    expect(() => validatePrices(items)).toThrow(/invalid price/i);
  });

  it('throws when items is not an array', () => {
    expect(() => validatePrices(null)).toThrow();
    expect(() => validatePrices(undefined)).toThrow();
  });

  it('throws identifying the first invalid item — only first error reported', () => {
    const items = [
      { priceAtPurchase: 5.00, quantity: 1 }, // valid
      { priceAtPurchase: -1.00, quantity: 1 }, // invalid
      { priceAtPurchase: -2.00, quantity: 1 }, // also invalid but only first matters
    ];
    expect(() => validatePrices(items)).toThrow(/invalid price/i);
  });
});
