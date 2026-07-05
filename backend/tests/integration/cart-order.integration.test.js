'use strict';

/**
 * Integration tests — Cart → Order end-to-end flow
 *
 * Tests the full user journey using actual HTTP calls through the Express app:
 *
 *   add to cart  →  verify cart state
 *   update qty   →  verify updated state
 *   place order  →  verify stock decremented + cart cleared + order persisted
 *   insufficient stock → verify 422 + stock unchanged + cart intact
 *
 * DB lifecycle is managed by tests/jest.setup.js.
 * JWT auth uses a stateless protect() middleware, so the token remains valid
 * even after afterEach wipes the users collection.
 */

const request  = require('supertest');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const app      = require('../../server');
const Product  = require('../../models/product.model');
const Cart     = require('../../models/cart.model');
const Order    = require('../../models/order.model');
const User     = require('../../models/user.model');

// ─── Auth setup ───────────────────────────────────────────────────────────────

let authToken;

beforeAll(async () => {
  const hash = await bcrypt.hash('IntegrationPass99!', 10);
  const user  = await User.create({
    email:    'cart-order-integration@example.com',
    password: hash,
  });
  authToken = jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '24h' },
  );
});

/** Attaches the Bearer token to a Supertest request */
const authed = (req) => req.set('Authorization', `Bearer ${authToken}`);

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SESSION = 'integration-cart-order-session-001';

const validShipping = {
  street:  '10 Integration Lane',
  city:    'Testville',
  postcode:'SW1A 1AA',
  country: 'United Kingdom',
};

const makeProduct = (overrides = {}) => ({
  name:        'Cart-Order Integration Product',
  description: 'Product used in cart/order integration tests.',
  price:       25.00,
  category:    'electronics',
  stock:       10,
  imageUrl:    'https://example.com/int.webp',
  ...overrides,
});

// ─── Add item to cart ─────────────────────────────────────────────────────────

describe('Integration: Add item to cart', () => {
  it('POST /api/cart → GET /api/cart reflects the new item and its quantity', async () => {
    const product = await Product.create(makeProduct());

    // Step 1: add the item
    const addRes = await request(app)
      .post('/api/cart')
      .send({ sessionId: SESSION, productId: product._id.toString(), quantity: 2 });

    expect(addRes.statusCode).toBe(201);
    expect(addRes.body.success).toBe(true);

    // Step 2: retrieve and verify
    const getRes = await request(app).get(`/api/cart/${SESSION}`);

    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.data.items).toHaveLength(1);
    expect(getRes.body.data.items[0].quantity).toBe(2);
  });
});

// ─── Update cart item quantity ─────────────────────────────────────────────────

describe('Integration: Update cart item quantity', () => {
  it('PUT /api/cart/:session/items/:product changes the quantity visible via GET', async () => {
    const product = await Product.create(makeProduct({ stock: 20 }));

    // Step 1: add with initial quantity
    await request(app)
      .post('/api/cart')
      .send({ sessionId: SESSION, productId: product._id.toString(), quantity: 1 });

    // Step 2: update to a different quantity
    const putRes = await request(app)
      .put(`/api/cart/${SESSION}/items/${product._id}`)
      .send({ quantity: 6 });

    expect(putRes.statusCode).toBe(200);
    expect(putRes.body.success).toBe(true);

    // Step 3: verify the updated quantity via GET
    const getRes = await request(app).get(`/api/cart/${SESSION}`);

    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.data.items[0].quantity).toBe(6);
  });
});

// ─── Place order — success path ────────────────────────────────────────────────

describe('Integration: Place order — success path', () => {
  let product;

  beforeEach(async () => {
    // Fresh product (stock=5) and a cart with 2 of them
    product = await Product.create(makeProduct({ price: 25.00, stock: 5 }));
    await request(app)
      .post('/api/cart')
      .send({ sessionId: SESSION, productId: product._id.toString(), quantity: 2 });
  });

  it('returns 201 and creates the order document in the DB', async () => {
    const res = await authed(
      request(app).post('/api/orders').send({
        sessionId:       SESSION,
        shippingAddress: validShipping,
        cardLastFour:    '4242',
      }),
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBeDefined();

    // Verify the order was actually persisted
    const order = await Order.findById(res.body.data._id);
    expect(order).not.toBeNull();
    expect(order.sessionId).toBe(SESSION);
  });

  it('decrements product stock by the ordered quantity (5 − 2 = 3)', async () => {
    await authed(
      request(app).post('/api/orders').send({
        sessionId:       SESSION,
        shippingAddress: validShipping,
        cardLastFour:    '4242',
      }),
    );

    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(3); // 5 initial − 2 ordered
  });

  it('clears the cart after the order is placed', async () => {
    await authed(
      request(app).post('/api/orders').send({
        sessionId:       SESSION,
        shippingAddress: validShipping,
        cardLastFour:    '4242',
      }),
    );

    const cart = await Cart.findOne({ sessionId: SESSION });
    expect(cart).toBeNull(); // cart document removed
  });

  it('order document has correct item snapshot and computed total', async () => {
    const res = await authed(
      request(app).post('/api/orders').send({
        sessionId:       SESSION,
        shippingAddress: validShipping,
        cardLastFour:    '4242',
      }),
    );

    const order = await Order.findById(res.body.data._id);

    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(2);
    expect(order.items[0].priceAtPurchase).toBe(25.00);
    expect(order.totalAmount).toBe(50.00); // 25.00 × 2
  });
});

// ─── Place order — insufficient stock ─────────────────────────────────────────

describe('Integration: Place order — insufficient stock', () => {
  let product;

  beforeEach(async () => {
    // Only 1 unit available; cart is seeded directly (bypassing cart-route stock
    // validation) so we can test the ORDER route's own stock check in isolation.
    product = await Product.create(makeProduct({ stock: 1 }));
    await Cart.create({
      sessionId: SESSION,
      items: [{ productId: product._id, quantity: 5 }],
    });
  });

  it('returns 422 with a stock-related error message', async () => {
    const res = await authed(
      request(app).post('/api/orders').send({
        sessionId:       SESSION,
        shippingAddress: validShipping,
        cardLastFour:    '4242',
      }),
    );

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/stock/i);
  });

  it('does NOT decrement product stock when the order is rejected', async () => {
    await authed(
      request(app).post('/api/orders').send({
        sessionId:       SESSION,
        shippingAddress: validShipping,
        cardLastFour:    '4242',
      }),
    );

    const unchanged = await Product.findById(product._id);
    expect(unchanged.stock).toBe(1); // unchanged — stock check rejected before any write
  });

  it('does NOT clear the cart when the order is rejected', async () => {
    await authed(
      request(app).post('/api/orders').send({
        sessionId:       SESSION,
        shippingAddress: validShipping,
        cardLastFour:    '4242',
      }),
    );

    const cart = await Cart.findOne({ sessionId: SESSION });
    expect(cart).not.toBeNull();
    expect(cart.items).toHaveLength(1); // item still in cart
  });

  it('does NOT create an Order document when the stock check fails', async () => {
    await authed(
      request(app).post('/api/orders').send({
        sessionId:       SESSION,
        shippingAddress: validShipping,
        cardLastFour:    '4242',
      }),
    );

    const orderCount = await Order.countDocuments({ sessionId: SESSION });
    expect(orderCount).toBe(0);
  });
});
