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
  RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(), // default: 300 in production, 3000 while developing (see below)
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  // Demo payments: Razorpay TEST mode only (keys start with rzp_test_). Empty = online payment is switched off.
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  // Free AI (Google Gemini free tier). Off unless GEMINI_ENABLED=true and a key is set; rule-based answers are used otherwise.
  GEMINI_ENABLED: z.preprocess((v) => String(v ?? 'false').toLowerCase() === 'true', z.boolean()),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-flash-lite-latest'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3-flash-preview'), // comma-separated, tried in order
  GEMINI_ATTEMPTS: z.coerce.number().int().min(1).max(12).default(10), // most tries in all (each one on the next model)
  GEMINI_BUDGET_MS: z.coerce.number().int().min(1000).default(48000), // the most time one AI call may take in all
  GEMINI_TRY_TIMEOUT_MS: z.coerce.number().int().min(1000).default(18000), // the most one try may wait for an answer
  GEMINI_CACHE_TTL_MS: z.coerce.number().int().min(0).default(3600000), // how long a good answer is remembered (0 = never)
  GEMINI_RETRY_MS: z.coerce.number().int().min(0).default(1500),
  GEMINI_DAILY_LIMIT: z.coerce.number().int().positive().default(200),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
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
// While developing, the web app, the phone, the tests and the background refreshes all come from one address and share one
// allowance, so it is generous; a real deployment keeps the tight default.
env.RATE_LIMIT_MAX = env.RATE_LIMIT_MAX ?? (env.isProd ? 300 : 3000);
env.uploadDir = path.resolve(env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));
env.isTest = env.NODE_ENV === 'test';
env.corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

module.exports = env;
