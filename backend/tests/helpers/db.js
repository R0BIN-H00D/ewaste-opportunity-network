'use strict';
const mongoose = require('mongoose');

let mongod;

/**
 * Uses TEST_MONGODB_URI if set (database name MUST contain "test"), otherwise an in-memory MongoDB
 * (mongodb-memory-server downloads a mongod binary on first run — needs internet once).
 */
async function connect() {
  let uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }
  await mongoose.connect(uri);
  if (process.env.TEST_MONGODB_URI && !/test/i.test(mongoose.connection.name)) {
    throw new Error(`Refusing to run tests against database "${mongoose.connection.name}" (name must contain "test")`);
  }
  const models = require('../../src/models');
  await Promise.all(Object.values(models).map((m) => m.init())); // build indexes (text, 2dsphere, unique)
}

async function clear() {
  for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
}

async function disconnect() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

module.exports = { connect, clear, disconnect };
