'use strict';
require('dotenv').config();
const path = require('path');
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/ewaste'),
  CLIENT_WEB_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:4173'),
  JWT_ACCESS_SECRET: z.string().default('change-me'),
  JWT_REFRESH_SECRET: z.string().default('change-me'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_GRACE_SECONDS: z.coerce.number().int().min(0).max(60).default(10), // 0 turns the grace for two refreshes at once off
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(14),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  STORAGE_DRIVER: z.enum(['cloudinary', 'local']).default('local'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional().default(''),
  SCHEDULER_ENABLED: z.preprocess((v) => String(v ?? 'true').toLowerCase() !== 'false', z.boolean()), // on unless set to false
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().default('E-Waste Network <no-reply@example.com>'),
  SUPPORT_EMAIL: z.string().default('support@example.com'), // where the public contact form is delivered
  NOMINATIM_BASE_URL: z.string().default('https://nominatim.openstreetmap.org'),
  NOMINATIM_USER_AGENT: z.string().default('EWasteOpportunityNetwork/0.1'),
  NOMINATIM_CONTACT_EMAIL: z.string().optional().default(''),
  UPLOAD_DIR: z.string().optional().default(''),
  CONTACT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  ADMIN_SEED_EMAIL: z.string().optional().default(''),
  ADMIN_SEED_PASSWORD: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production') {
  const weak = [env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET].some(
    (s) => s === 'change-me' || s.length < 32,
  );
  if (weak) {
    // eslint-disable-next-line no-console
    console.error('Refusing to start: set strong JWT_*_SECRET values (>=32 chars) in production.');
    process.exit(1);
  }
}

env.isProd = env.NODE_ENV === 'production';
env.uploadDir = path.resolve(env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));
env.isTest = env.NODE_ENV === 'test';
env.corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

module.exports = env;
