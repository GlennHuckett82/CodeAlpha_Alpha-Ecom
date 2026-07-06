'use strict';

const { Router } = require('express');
const { query, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Product = require('../models/product.model');

const router = Router();

/** Sends a 422 with the express-validator error array */
const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }
  return null;
};

// ─── Validation rules ─────────────────────────────────────────────────────────

const listValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('limit must be a positive integer')
    .toInt(),
  query('cursor')
    .optional()
    .isMongoId()
    .withMessage('cursor must be a valid MongoDB ObjectId'),
  query('category')
    .optional()
    .trim()
    .escape(),
  query('search')
    .optional()
    .trim(),
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('id must be a valid MongoDB ObjectId'),
];

/**
 * @openapi
 * /api/products:
 *   get:
 *     tags: [Products]
 *     summary: List products
 *     description: >
 *       Returns a paginated product list. Supports two modes:
 *       **Cursor mode** (default) — efficient, index-only traversal; pass the
 *       `nextCursor` value from the previous response as `?cursor=`.
 *       **Offset mode** — classic page/limit; activated by supplying `?page=`.
 *     operationId: listProducts
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *         description: Activates offset mode. Page number (1-based).
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 12 }
 *         description: Results per page (capped at 50).
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *         description: Last `_id` from the previous cursor-mode response.
 *         example: 64a1f2c3e4b05d8f9a0b1c2d
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [electronics, clothing, sports, books]
 *         description: Filter by product category (case-insensitive).
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search term (requires the text index on `name` + `description`).
 *         example: wireless headphones
 *     responses:
 *       '200':
 *         description: OK — cursor mode response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *                 nextCursor: { type: string, nullable: true, example: 64a1f2c3e4b05d8f9a0b1c2d }
 *                 hasNextPage: { type: boolean, example: true }
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 */
// ─── GET /api/products ────────────────────────────────────────────────────────
//
// Two modes, selected by the presence of ?page=:
//
//   Cursor mode  (default, no ?page=)
//     – Uses ?cursor= (last _id from previous page) + ?limit=
//     – Query: { _id: { $gt: cursor } } sorted by _id ASC
//     – Returns: { success, data, nextCursor, hasNextPage }
//     – Efficient: uses the _id index, no COUNT(*) needed
//
//   Offset mode  (?page= present — backward compatibility)
//     – Uses ?page= + ?limit= (classic skip/limit)
//     – Returns: { success, data, pagination: { page, limit, total, … } }

router.get('/', listValidation, async (req, res, next) => {
  const invalid = handleValidationErrors(req, res);
  if (invalid) return;

  try {
    const limit = Math.min(req.query.limit || 12, 50);

    // Build shared filter (applies to both modes)
    const filter = {};
    if (req.query.category) {
      filter.category = req.query.category.toLowerCase();
    }
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    // ── Offset mode (?page= present) ──────────────────────────────────────────
    if (req.query.page !== undefined) {
      const page  = req.query.page;
      const skip  = (page - 1) * limit;

      const [products, total] = await Promise.all([
        Product.find(filter).skip(skip).limit(limit).lean(),
        Product.countDocuments(filter),
      ]);

      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

      return res.status(200).json({
        success: true,
        data: products,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    }

    // ── Cursor mode (default) ─────────────────────────────────────────────────
    if (req.query.cursor) {
      filter._id = { $gt: new mongoose.Types.ObjectId(req.query.cursor) };
    }

    // Fetch limit+1 to detect whether a next page exists without COUNT(*)
    const products = await Product
      .find(filter)
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean();

    const hasNextPage = products.length > limit;
    const data        = hasNextPage ? products.slice(0, limit) : products;
    const nextCursor  = hasNextPage ? data[data.length - 1]._id.toString() : null;

    return res.status(200).json({
      success: true,
      data,
      nextCursor,
      hasNextPage,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * @openapi
 * /api/products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by ID
 *     operationId: getProductById
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the product.
 *         example: 64a1f2c3e4b05d8f9a0b1c2d
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 */
// ─── GET /api/products/:id ────────────────────────────────────────────────────

router.get('/:id', idValidation, async (req, res, next) => {
  const invalid = handleValidationErrors(req, res);
  if (invalid) return;

  try {
    const product = await Product.findById(req.params.id).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

