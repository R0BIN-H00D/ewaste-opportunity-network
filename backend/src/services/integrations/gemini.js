'use strict';
// Google Gemini (free tier) over its REST API, with fetch: no extra package. Used only when someone presses an AI button,
// and only with the photos and words they just gave. Switched off when GEMINI_ENABLED is not true or there is no key.
//
// The free tier is slow or busy now and then, one model at a time. So a call is made to work this way:
//  - each attempt uses the next model in the list (GEMINI_MODEL, then GEMINI_FALLBACK_MODEL);
//  - a "high demand" answer (503), a gone model (404), a timeout and a dropped connection all count as "try the next one";
//  - it pauses only after every model has been tried once, and gives up when the time budget (GEMINI_BUDGET_MS) is used up;
//  - a good answer is remembered for a while (GEMINI_CACHE_TTL_MS), so pressing the button again with the same photos and words
//    is instant and costs no quota.
const crypto = require('crypto');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_CACHED = 100;
let usage = { day: '', count: 0 };
const cache = new Map(); // key -> { at, value }

const isEnabled = () => env.GEMINI_ENABLED && Boolean(env.GEMINI_API_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Keeps the app under the free daily quota. Resets each UTC day. */
function takeQuota() {
  const day = new Date().toISOString().slice(0, 10);
  if (usage.day !== day) usage = { day, count: 0 };
  if (usage.count >= env.GEMINI_DAILY_LIMIT) return false;
  usage.count += 1;
  return true;
}

const cacheKey = (prompt, images) => {
  const h = crypto.createHash('sha256').update(prompt);
  for (const i of images) h.update(i.mimeType).update(i.buffer);
  return h.digest('hex');
};
function fromCache(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > env.GEMINI_CACHE_TTL_MS) { cache.delete(key); return undefined; }
  return hit.value;
}
function remember(key, value) {
  if (env.GEMINI_CACHE_TTL_MS <= 0) return;
  cache.set(key, { at: Date.now(), value });
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value); // the oldest goes first
}

/**
 * Asks Gemini for a JSON answer. `images` are [{ mimeType, buffer }].
 * Returns the parsed object, or throws ApiError (503 when off, over the daily limit, or still busy or slow after every try).
 */
async function generateJson({ prompt, images = [] }) {
  if (!isEnabled()) throw new ApiError(503, 'AI suggestions are not switched on', 'AI_DISABLED');
  const key = cacheKey(prompt, images);
  const cached = fromCache(key);
  if (cached !== undefined) return cached;
  if (!takeQuota()) throw new ApiError(503, 'The free AI quota for today is used up. Try again tomorrow.', 'AI_QUOTA');

  const parts = [{ text: prompt }, ...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.buffer.toString('base64') } }))];
  const body = JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
  const models = [env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODEL.split(',')].map((m) => m.trim()).filter(Boolean);
  const deadline = Date.now() + env.GEMINI_BUDGET_MS;

  let res;
  let json = {};
  let outcome = 'busy'; // what the last attempt came to: busy | timeout | error
  for (let attempt = 0; attempt < env.GEMINI_ATTEMPTS; attempt += 1) {
    const left = deadline - Date.now();
    if (attempt > 0 && left < 2000) break;
    const model = models[attempt % models.length];
    try {
      res = await fetch(`${BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body,
        signal: AbortSignal.timeout(Math.max(2000, Math.min(env.GEMINI_TRY_TIMEOUT_MS, left))),
      });
    } catch (err) {
      // A timeout or a dropped connection: this model did not answer in time, so try the next one.
      outcome = 'timeout';
      res = undefined;
      logger.warn({ model, err: err.message, cause: err.cause?.message }, 'gemini did not answer');
      if ((attempt + 1) % models.length === 0) await sleep(env.GEMINI_RETRY_MS);
      continue;
    }
    json = await res.json().catch(() => ({}));
    if (res.ok) break;
    logger.warn({ model, status: res.status, msg: json?.error?.message }, 'gemini request failed');
    if (res.status === 503 || res.status === 404 || res.status === 500) {
      outcome = 'busy';
      if ((attempt + 1) % models.length === 0) await sleep(env.GEMINI_RETRY_MS);
      continue;
    }
    outcome = res.status === 429 ? 'busy' : 'error';
    break; // a refusal that another model will not change (bad key, bad request)
  }

  if (!res || !res.ok) {
    if (outcome === 'error') throw new ApiError(502, 'The AI service refused the request', 'AI_ERROR');
    throw new ApiError(
      503,
      outcome === 'timeout' ? 'The AI service is slow right now and did not answer in time. Try again in a moment.' : 'The AI service is busy right now. Try again in a moment.',
      outcome === 'timeout' ? 'AI_UNREACHABLE' : 'AI_ERROR',
    );
  }
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  let value;
  try {
    value = JSON.parse(text.replace(/^```(?:json)?|```$/gm, '').trim());
  } catch {
    throw new ApiError(502, 'The AI service gave an answer that could not be read', 'AI_BAD_ANSWER');
  }
  remember(key, value);
  return value;
}

const _resetQuota = () => { usage = { day: '', count: 0 }; cache.clear(); }; // tests only

module.exports = { isEnabled, generateJson, _resetQuota };
