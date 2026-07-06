'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');
const Order = require('../models/order.model');
const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const { checkStock, decrementStock } = require('../services/inventoryService');
const { calculateOrderTotal } = require('../services/pricingService');
const { processPayment } = require('../services/paymentService');
const { protect } = require('../middleware/auth');

const router = Router();

// ─── Shared helpers ───────────────────────────────────────────────────────────

const sendValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

/**
 * @openapi
 * /api/orders:
 *   post:
 *     tags: [Orders]
 *     summary: Place an order
 *     description: >
 *       Validates cart, checks stock, simulates payment, decrements stock,
 *       persists the order, and deletes the cart in one atomic-ish operation.
 *       Stock is rolled back automatically if the Order write fails.
 *       Requires a valid JWT Bearer token.
 *     operationId: createOrder
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, shippingAddress, cardLastFour]
 *             properties:
 *               sessionId:
 *                 type: string
 *                 example: a1b2c3d4-e5f6-7890-ab12-cd34ef56gh78
 *               shippingAddress:
 *                 $ref: '#/components/schemas/Address'
 *               cardLastFour:
 *                 type: string
 *                 pattern: '^\d{4}$'
 *                 description: Last 4 digits of the payment card.
 *                 example: '4242'
 *     responses:
 *       '201':
 *         description: Created — order placed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Order' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 */
// ─── POST /api/orders ─────────────────────────────────────────────────────────
//
// Orchestration flow:
//   1. Validate request body
//   2. Find cart (404 if missing, 422 if empty)
//   3. checkStock for every cart item (422 on failure)
//   4. Build order items with priceAtPurchase from current product price
//   5. calculateOrderTotal
//   6. processPayment (422 if declined)
//   7. decrementStock for each item — track in `decremented[]`
//   8. Order.create — if this throws, roll back all decremented stock
//   9. Cart.deleteOne to clear cart
//  10. Return 201 with the new order

router.post('/', protect, [
  body('sessionId')
    .notEmpty()
    .withMessage('sessionId is required')
    .trim(),
  body('shippingAddress')
    .exists({ checkNull: true })
    .withMessage('shippingAddress is required'),
  body('shippingAddress.street')
    .notEmpty()
    .withMessage('shippingAddress.street is required')
    .trim()
    .escape(),
  body('shippingAddress.city')
    .notEmpty()
    .withMessage('shippingAddress.city is required')
    .trim()
    .escape(),
  body('shippingAddress.postcode')
    .notEmpty()
    .withMessage('shippingAddress.postcode is required')
    .trim()
    .escape(),
  body('shippingAddress.country')
    .notEmpty()
    .withMessage('shippingAddress.country is required')
    .trim()
    .escape(),
  body('cardLastFour')
    .matches(/^\d{4}$/)
    .withMessage('cardLastFour must be exactly 4 digits'),
], async (req, res, next) => {
  if (sendValidationErrors(req, res)) return;

  const { sessionId, shippingAddress, cardLastFour } = req.body;

  try {
    // ── 1. Find + validate cart ──────────────────────────────────────────────
    const cart = await Cart
      .findOne({ sessionId })
      .populate('items.productId');

    if (!cart) {
      return res.status(404).json({ success: false, error: 'Cart not found' });
    }
    if (cart.items.length === 0) {
      return res.status(422).json({ success: false, error: 'Cart is empty' });
    }

    // ── 2. Stock check + build order items ───────────────────────────────────
    const orderItems = [];
    for (const item of cart.items) {
      // eslint-disable-next-line no-await-in-loop
      await checkStock(item.productId._id, item.quantity);
      orderItems.push({
        productId: item.productId._id,
        quantity: item.quantity,
        priceAtPurchase: item.productId.price,
      });
    }

    // ── 3. Calculate total ───────────────────────────────────────────────────
    const totalAmount = calculateOrderTotal(orderItems);

    // ── 4. Process payment ───────────────────────────────────────────────────
    const payment = await processPayment({ totalAmount, cardLastFour });
    if (!payment.success) {
      return res.status(422).json({ success: false, error: payment.error });
    }

    // ── 5. Decrement stock + create order (with rollback) ────────────────────
    const decremented = [];
    try {
      for (const item of orderItems) {
        // eslint-disable-next-line no-await-in-loop
        await decrementStock(item.productId, item.quantity);
        decremented.push(item);
      }

      const order = await Order.create({
        sessionId,
        items: orderItems,
        totalAmount,
        shippingAddress,
      });

      // ── 6. Clear cart ──────────────────────────────────────────────────────
      await Cart.deleteOne({ sessionId });

      return res.status(201).json({ success: true, data: order });
    } catch (writeErr) {
      // Roll back every successfully decremented item
      for (const item of decremented) {
        // eslint-disable-next-line no-await-in-loop
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: item.quantity } },
        );
      }
      throw writeErr;
    }
  } catch (err) {
    if (/insufficient stock/i.test(err.message)) {
      return res.status(422).json({ success: false, error: err.message });
    }
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ success: false, error: err.message });
    }
    return next(err);
  }
});

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order by ID
 *     description: Returns the full order document. Requires a valid JWT Bearer token.
 *     operationId: getOrderById
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the order.
 *         example: 64a1f2c3e4b05d8f9a0b1c30
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Order' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 */
// ─── GET /api/orders/:id ──────────────────────────────────────────────────────

router.get('/:id', protect, [
  param('id')
    .isMongoId()
    .withMessage('id must be a valid MongoDB ObjectId'),
], async (req, res, next) => {
  if (sendValidationErrors(req, res)) return;

  try {
    const order = await Order.findById(req.params.id).lean();

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    return res.status(200).json({ success: true, data: order });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
