'use strict';

/**
 * backend/server.e2e.js — E2E test server
 *
 * Starts mongodb-memory-server, seeds the DB with known test products,
 * then starts the Express app on port 3000 (serving both the API and the
 * static frontend via express.static).
 *
 * Used as playwright.config.js webServer command:
 *   command: 'node server.e2e.js', cwd: 'backend/'
 *
 * Keeps the memory server alive until the process is killed by Playwright.
 */

require('dotenv').config();

// ES module <script type="module"> sends Origin: http://localhost:3000.
// Allow the server's own origin so static JS is served without a 403.
process.env.CORS_ORIGIN = 'http://localhost:3000';

// Use a fixed known secret so E2E tests can generate valid tokens without
// needing a .env file.  This is NOT the production secret.
process.env.JWT_SECRET = 'e2e-test-jwt-secret';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_PRODUCTS = [
  {
    name: 'Wireless Noise-Cancelling Headphones',
    description: 'Over-ear Bluetooth headphones with 30-hour battery life.',
    price: 79.99,
    category: 'electronics',
    stock: 50,
    imageUrl: '',
  },
  {
    name: 'Mechanical Gaming Keyboard',
    description: 'Tenkeyless mechanical keyboard with RGB backlighting.',
    price: 129.99,
    category: 'electronics',
    stock: 50,
    imageUrl: '',
  },
  {
    name: 'Running Shoes — Size 10',
    description: 'Lightweight trainers with cushioned sole.',
    price: 89.99,
    category: 'clothing',
    stock: 50,
    imageUrl: '',
  },
  {
    name: 'Yoga Mat',
    description: 'Non-slip 6mm exercise mat.',
    price: 34.99,
    category: 'sports',
    stock: 50,
    imageUrl: '',
  },
  {
    name: 'JS — The Good Parts',
    description: 'Classic guide to the best features of JavaScript.',
    price: 24.99,
    category: 'books',
    stock: 50,
    imageUrl: '',
  },
];

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function main() {
  // 1. Start in-memory MongoDB
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // 2. Connect and seed BEFORE the Express app boots
  await mongoose.connect(uri);

  const Product = require('./models/product.model');
  await Product.createIndexes();
  await Product.insertMany(SEED_PRODUCTS);
  console.log(`[E2E] Seeded ${SEED_PRODUCTS.length} products`);

  // 3. Keep Mongoose connected — the Express app shares the same connection
  //    (server.js imports mongoose and uses the already-open connection when
  //    mongoose.connect() is called again with the same URI, it resolves
  //    immediately because the state is already 'connected').
  process.env.MONGO_URI = uri;

  // 4. Require the app (require.main !== module, so no listen/connectDB runs)
  const app = require('./server');
  const PORT = process.env.PORT || 3000;

  // 5. Start listening
  app.listen(PORT, () => {
    console.log(`[E2E] Server ready → http://localhost:${PORT}`);
  });

  // 6. Keep memory server alive for the duration of the process
  process.on('SIGTERM', async () => {
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[E2E] Server start failed:', err);
  process.exit(1);
});
