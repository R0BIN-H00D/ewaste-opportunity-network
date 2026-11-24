'use strict';
// Razorpay in TEST mode only (demo). Talks to the REST API with fetch, so no extra package is needed.
// Live keys (rzp_live_...) are refused on purpose: this project never handles real money.
const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const BASE = 'https://api.razorpay.com/v1';

const isConfigured = () => /^rzp_test_/.test(env.RAZORPAY_KEY_ID) && Boolean(env.RAZORPAY_KEY_SECRET);

function assertConfigured() {
  if (!isConfigured()) {
    throw new ApiError(503, 'Online payment is not switched on yet. Please choose another way to pay.', 'PAYMENTS_NOT_CONFIGURED');
  }
}

async function call(method, path, body) {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(502, 'The payment service could not be reached. Try again.', 'GATEWAY_UNREACHABLE');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(502, json?.error?.description || 'The payment service refused the request', 'GATEWAY_ERROR');
  return json;
}

/** amountRupees -> a Razorpay order (amount in paise). */
async function createOrder({ amountRupees, receipt, notes }) {
  assertConfigured();
  return call('POST', '/orders', { amount: Math.round(amountRupees * 100), currency: 'INR', receipt: String(receipt).slice(0, 40), notes });
}

/** Checks the signature Razorpay returns to the checkout: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
function verifySignature({ orderId, paymentId, signature }) {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function refund(paymentId, amountRupees) {
  assertConfigured();
  return call('POST', `/payments/${paymentId}/refund`, { amount: Math.round(amountRupees * 100) });
}

module.exports = { assertAvailable: assertConfigured, isConfigured, createOrder, verifySignature, refund, keyId: () => env.RAZORPAY_KEY_ID };
