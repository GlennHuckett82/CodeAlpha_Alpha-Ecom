'use strict';

/**
 * ============================================================
 * SCHEMA DESIGN: Cart
 * Collection: carts
 * Implemented in: P9
 * ============================================================
 *
 * DESIGN DECISION: Session-based cart (no auth required)
 *   A UUID v4 sessionId is generated client-side (cartState.js) and
 *   stored in localStorage. This allows guest checkout without login.
 *   If JWT auth (P20) is added, sessionId can be swapped for userId.
 *
 * FIELDS
 * ──────
 * sessionId     {String}
 *               - required: true
 *               - trim: true
 *               - Indexed: unique index — one cart per session (P21)
 *               - Format: UUID v4 (e.g. "550e8400-e29b-41d4-a716-446655440000")
 *
 * items         {Array of subdocuments}
 *               - default: []
 *               - Each subdocument contains:
 *
 *     items[].productId    {ObjectId}
 *                          - required: true
 *                          - ref: 'Product'  (for .populate() in cart routes)
 *
 *     items[].quantity     {Number}
 *                          - required: true
 *                          - min: 1   (quantity of zero handled by DELETE, not PUT)
 *                          - Integer only — enforced at route/service layer
 *
 * updatedAt     {Date}
 *               - Handled automatically by Mongoose `timestamps: true` option
 *               - Also updated explicitly via pre-save hook to track last activity
 *               - Used for TTL index to auto-expire abandoned carts (future enhancement)
 *
 * ──────────────────────────────────────────────────────────
 * INDEXES (created in P21 via Model.syncIndexes())
 * ──────────────────────────────────────────────────────────
 * 1. Unique      : { sessionId: 1 }   (unique: true)
 *    Purpose     : Fast cart retrieval by session; enforces one-cart-per-session
 *
 * FUTURE:
 * 2. TTL         : { updatedAt: 1 }   (expireAfterSeconds: 604800)  ← 7 days
 *    Purpose     : Auto-delete abandoned carts — not implemented in this project
 *
 * ──────────────────────────────────────────────────────────
 * RELATIONSHIPS
 * ──────────────────────────────────────────────────────────
 * items[].productId references: Product._id
 *   Populated in GET /api/cart/:sessionId to return product name + price
 *
 * Cart is cleared (deleteMany) when an Order is placed successfully (P16)
 *
 * ──────────────────────────────────────────────────────────
 * SAMPLE DOCUMENT
 * ──────────────────────────────────────────────────────────
 * {
 *   _id:       ObjectId("64f2b3c4d5e6f7a8b9c0d2e3"),
 *   sessionId: "550e8400-e29b-41d4-a716-446655440000",
 *   items: [
 *     { productId: ObjectId("64f1a2b3..."), quantity: 2 },
 *     { productId: ObjectId("64f1a2c4..."), quantity: 1 }
 *   ],
 *   createdAt:  ISODate("2024-03-01T09:00:00Z"),
 *   updatedAt:  ISODate("2024-03-01T09:45:00Z")
 * }
 *
 * ============================================================
 * Implementation — P9
 * ============================================================
 */

const mongoose = require('mongoose');

// ─── Item subdocument schema ──────────────────────────────────────────────────

const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Item productId is required'],
    },
    quantity: {
      type: Number,
      required: [true, 'Item quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
  },
  { _id: false }, // subdocuments don't need their own _id
);

// ─── Cart schema ──────────────────────────────────────────────────────────────

const cartSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: [true, 'sessionId is required'],
      trim: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true, // auto-manages createdAt + updatedAt
  },
);

// ─── Pre-save hook ────────────────────────────────────────────────────────────

// Explicitly mark updatedAt on every save so it is always current,
// even when only subdocument fields are modified (Mongoose does not
// always detect nested changes automatically).
cartSchema.pre('save', function markUpdated(next) {
  this.updatedAt = new Date();
  next();
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Unique index: one cart per session + fast lookup by sessionId
cartSchema.index({ sessionId: 1 }, { unique: true });

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Cart', cartSchema);
