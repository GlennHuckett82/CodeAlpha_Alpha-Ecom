'use strict';

const Product = require('../models/product.model');

/**
 * Validates that a requested quantity is a positive integer.
 * Throws a synchronous Error if invalid.
 */
const assertValidQuantity = (quantity) => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Invalid quantity: ${quantity}. Must be a positive integer.`);
  }
};

/**
 * checkStock(productId, quantity)
 *
 * Verifies that a product exists and has sufficient stock for the
 * requested quantity. Throws if the product is not found or if
 * stock is insufficient. Returns the product document on success.
 *
 * @param {mongoose.Types.ObjectId|string} productId
 * @param {number} quantity  Positive integer
 * @returns {Promise<Product>}
 */
const checkStock = async (productId, quantity) => {
  assertValidQuantity(quantity);

  const product = await Product.findById(productId);

  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  if (product.stock < quantity) {
    throw new Error(
      `Insufficient stock for product "${product.name}": `
      + `requested ${quantity}, available ${product.stock}.`,
    );
  }

  return product;
};

/**
 * decrementStock(productId, quantity)
 *
 * Atomically reduces a product's stock by the given quantity using a
 * conditional findOneAndUpdate. The update only applies when the current
 * stock is >= quantity, preventing stock from going below zero even under
 * concurrent requests.
 *
 * Throws if the product is not found or if stock is insufficient.
 * Returns the updated product document on success.
 *
 * @param {mongoose.Types.ObjectId|string} productId
 * @param {number} quantity  Positive integer
 * @returns {Promise<Product>}
 */
const decrementStock = async (productId, quantity) => {
  assertValidQuantity(quantity);

  // Atomic conditional update: only executes when stock >= quantity
  const updated = await Product.findOneAndUpdate(
    { _id: productId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } },
    { new: true },
  );

  if (updated) {
    return updated;
  }

  // Update returned null — determine whether the product exists at all
  // so we can return a meaningful error message.
  const exists = await Product.exists({ _id: productId });

  if (!exists) {
    throw new Error(`Product not found: ${productId}`);
  }

  // Product exists but stock was insufficient
  const product = await Product.findById(productId);
  throw new Error(
    `Insufficient stock for product "${product.name}": `
    + `requested ${quantity}, available ${product.stock}.`,
  );
};

module.exports = { checkStock, decrementStock };
