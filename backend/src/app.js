'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const pinoHttp = require('pino-http');
const env = require('./config/env');
const logger = require('./utils/logger');
const { globalLimiter } = require('./middleware/rateLimit');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/error');
const ApiError = require('./utils/ApiError');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  // CORP cross-origin: the web app (another origin) must be able to load uploaded images in development.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, cb) {
        // Allow non-browser clients (mobile app, curl) that send no Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(ApiError.forbidden('This origin is not allowed to use the API', 'CORS_BLOCKED'));
      },
      credentials: true,
      // Lets the web app read the file name and the row count of a CSV download.
      exposedHeaders: ['Content-Disposition', 'X-Export-Rows', 'X-Export-Truncated'],
    }),
  );
  app.use(globalLimiter);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  if (!env.isTest) app.use(pinoHttp({ logger }));

  // Local-disk uploads (development only). Private documents live under uploads/_private and are never served here.
  if (!env.isProd) {
    app.use('/uploads', express.static(path.join(env.uploadDir, 'public'), { dotfiles: 'deny', index: false }));
  }

  app.use('/api', require('./routes'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
