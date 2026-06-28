'use strict';

/**
 * validatePrices(items)
 *
 * Iterates over an order items array and throws if any item has a
 * priceAtPurchase that is missing, zero, or negative.
 *
 * @param {Array<{priceAtPurchase: number, quantity: number}>} items
 * @throws {Error} on the first item with an invalid price
 */
const validatePrices = (items) => {
  if (!Array.isArray(items)) {
    throw new Error('items must be an array');
  }

  for (let i = 0; i < items.length; i += 1) {
    const price = items[i].priceAtPurchase;
    if (price === undefined || price === null || price <= 0) {
      throw new Error(
        `Invalid price at item index ${i}: priceAtPurchase must be > 0, got ${price}.`,
      );
    }
  }
};

/**
 * calculateOrderTotal(items)
 *
 * Returns the sum of (priceAtPurchase × quantity) for every item in the
 * array, rounded to 2 decimal places to avoid floating-point drift.
 *
 * @param {Array<{priceAtPurchase: number, quantity: number}>} items
 * @returns {number}  Total rounded to 2 decimal places
 */
const calculateOrderTotal = (items) => {
  if (!Array.isArray(items)) {
    throw new Error('items must be an array');
  }

  const total = items.reduce((sum, item, index) => {
    const { priceAtPurchase, quantity } = item;

    if (priceAtPurchase === undefined || priceAtPurchase === null) {
      throw new Error(`Item at index ${index} is missing priceAtPurchase.`);
    }
    if (quantity === undefined || quantity === null) {
      throw new Error(`Item at index ${index} is missing quantity.`);
    }

    return sum + priceAtPurchase * quantity;
  }, 0);

  // Round to 2 decimal places to prevent floating-point accumulation errors
  return Math.round(total * 100) / 100;
};

module.exports = { calculateOrderTotal, validatePrices };
