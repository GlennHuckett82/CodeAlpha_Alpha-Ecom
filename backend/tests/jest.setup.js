'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;

// Start in-memory MongoDB and connect Mongoose before all tests in every file
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

// Flush the cache BEFORE each test so a test can never start with state left
// by a previous suite running in the same Jest worker process.
// (afterEach alone has a race window: Suite B's first test can run before
// Suite A's afterEach fires, causing spurious X-Cache: HIT on expected MISSes.)
beforeEach(() => {
  require('../middleware/cache').flushCache();
});

// Wipe every collection and flush cache AFTER each test for clean teardown
afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
  require('../middleware/cache').flushCache();
});

// Disconnect Mongoose and stop the in-memory server after all tests in the file
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
});
