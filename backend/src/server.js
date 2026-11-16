'use strict';
const http = require('http');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const createApp = require('./app');

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  // Socket.IO attaches to this same server in Phase 8 (src/sockets).

  try {
    await connectDB();
  } catch (err) {
    logger.error({ err: err.message }, 'MongoDB connection failed — API will run but DB-backed routes will fail');
  }

  server.listen(env.PORT, () => logger.info(`API listening on :${env.PORT} (${env.NODE_ENV})`));

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
