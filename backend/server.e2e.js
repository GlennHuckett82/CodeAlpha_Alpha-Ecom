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
// CDN helpers — IDs verified free (no Unsplash+ / Pexels licence required).
const unsplash = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&h=300&q=80`;
const pexels   = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop`;

const SEED_PRODUCTS = [
  // ── Electronics ──────────────────────────────────────────────────────────
  {
    name: 'Wireless Noise-Cancelling Headphones',
    description: 'Over-ear Bluetooth headphones with active noise cancellation, 30-hour battery life, and a foldable design ideal for travel.',
    price: 79.99,
    category: 'electronics',
    stock: 48,
    imageUrl: unsplash('1546435770-a3e426bf472b'),
  },
  {
    name: 'Mechanical Gaming Keyboard',
    description: 'Tenkeyless keyboard with Cherry MX Red switches, per-key RGB backlighting, and an aluminium top plate.',
    price: 129.99,
    category: 'electronics',
    stock: 23,
    imageUrl: pexels('9020272'),
  },
  {
    name: '4K USB-C Webcam',
    description: 'Wide-angle 4K webcam with built-in dual microphone, auto light correction, and a physical privacy shutter.',
    price: 89.99,
    category: 'electronics',
    stock: 15,
    imageUrl: pexels('7172701'),
  },
  {
    name: 'USB-C Hub 7-in-1',
    description: 'Expands a single USB-C port to HDMI 4K, three USB-A ports, SD card reader, and 100W power delivery pass-through.',
    price: 44.99,
    category: 'electronics',
    stock: 60,
    imageUrl: pexels('4195404'),
  },
  {
    name: 'Portable Bluetooth Speaker',
    description: 'IP67 waterproof Bluetooth 5.3 speaker with 360-degree sound, 24-hour battery, and USB-C fast charging.',
    price: 59.99,
    category: 'electronics',
    stock: 35,
    imageUrl: pexels('4917455'),
  },
  // ── Clothing ─────────────────────────────────────────────────────────────
  {
    name: 'Running Shoes',
    description: 'Lightweight road-running trainers with a responsive foam midsole, breathable mesh upper, and reflective heel tab.',
    price: 89.99,
    category: 'clothing',
    stock: 40,
    imageUrl: unsplash('1542291026-7eec264c27ff'),
  },
  {
    name: 'Merino Wool Hoodie',
    description: '100% extra-fine merino wool hoodie. Temperature-regulating, naturally odour-resistant, and machine washable.',
    price: 65.00,
    category: 'clothing',
    stock: 28,
    imageUrl: pexels('5840463'),
  },
  {
    name: 'Waterproof Hiking Jacket',
    description: '3-layer Gore-Tex hiking jacket with pit-zip vents, a helmet-compatible hood, and two hand pockets.',
    price: 119.99,
    category: 'clothing',
    stock: 17,
    imageUrl: unsplash('1543274747-e969ff86c466'),
  },
  {
    name: 'Compression Training Shorts',
    description: 'Mid-thigh compression shorts with four-way stretch fabric, reflective logo, and a secure zip pocket.',
    price: 34.99,
    category: 'clothing',
    stock: 55,
    imageUrl: pexels('29259722'),
  },
  {
    name: 'Classic Oxford Shirt',
    description: 'Button-down Oxford weave shirt in 100% cotton. Easy-iron finish and slim fit.',
    price: 49.99,
    category: 'clothing',
    stock: 44,
    imageUrl: unsplash('1770058428099-f2d64ab34006'),
  },
  // ── Sports ───────────────────────────────────────────────────────────────
  {
    name: 'Non-Slip Yoga Mat',
    description: '6mm thick TPE yoga mat with alignment lines, non-slip texture on both sides, and a carry strap.',
    price: 34.99,
    category: 'sports',
    stock: 70,
    imageUrl: pexels('4325439'),
  },
  {
    name: 'Resistance Band Set',
    description: 'Five loop resistance bands (5 to 30 kg) with a carry pouch and illustrated exercise guide. Latex-free.',
    price: 19.99,
    category: 'sports',
    stock: 90,
    imageUrl: pexels('6516206'),
  },
  {
    name: 'Adjustable Dumbbell 20 kg',
    description: 'Single quick-dial dumbbell replacing eight separate weights. Selects 2 to 20 kg in 2 kg increments.',
    price: 89.99,
    category: 'sports',
    stock: 12,
    imageUrl: unsplash('1685633224688-6a77675eb119'),
  },
  {
    name: 'High-Density Foam Roller',
    description: '45 cm EVA foam roller for muscle recovery and myofascial release. Supports up to 150 kg.',
    price: 24.99,
    category: 'sports',
    stock: 65,
    imageUrl: pexels('6207519'),
  },
  {
    name: 'Speed Jump Rope',
    description: 'Lightweight aluminium handles with ball-bearing rotation and an adjustable PVC cable. Suitable for double-unders.',
    price: 14.99,
    category: 'sports',
    stock: 80,
    imageUrl: unsplash('1514994667787-b48ca37155f0'),
  },
  // ── Books ─────────────────────────────────────────────────────────────────
  {
    name: 'JS — The Good Parts',
    description: "Douglas Crockford's concise guide to the best features of JavaScript. Essential reading for any JS developer.",
    price: 24.99,
    category: 'books',
    stock: 30,
    imageUrl: unsplash('1497633762265-9d179a990aa6'),
  },
  {
    name: 'Clean Code',
    description: 'Robert C. Martin on writing readable, maintainable software. Covers naming, functions, error handling, and refactoring.',
    price: 29.99,
    category: 'books',
    stock: 25,
    imageUrl: pexels('3861951'),
  },
  {
    name: 'The Pragmatic Programmer',
    description: 'Timeless advice on software craftsmanship from Hunt and Thomas. 20th anniversary edition with new chapters.',
    price: 34.99,
    category: 'books',
    stock: 22,
    imageUrl: pexels('9553905'),
  },
  {
    name: 'Designing Data-Intensive Applications',
    description: "Martin Kleppmann's deep dive into databases, distributed systems, and the tradeoffs that define modern data engineering.",
    price: 39.99,
    category: 'books',
    stock: 18,
    imageUrl: pexels('5480781'),
  },
  {
    name: "You Don't Know JS",
    description: "Kyle Simpson's six-book series covering JavaScript in depth: scopes, closures, async, and ES6+.",
    price: 27.99,
    category: 'books',
    stock: 33,
    imageUrl: pexels('4578665'),
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
  console.log(`[dev:seed] Seeded ${SEED_PRODUCTS.length} products (electronics, clothing, sports, books)`);

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
    console.log(`[dev:seed] Server ready — open http://localhost:${PORT} in Chrome`);
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
