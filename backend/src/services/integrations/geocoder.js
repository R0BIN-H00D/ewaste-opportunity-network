'use strict';
// Address search and "where is this point" through OpenStreetMap's free Nominatim service (P8-08, FR-LOC). Its usage policy
// asks for at most one request a second, a real User-Agent, and no bulk use, so every call goes through one queue that spaces
// them out, and answers are kept for a day. If it cannot be reached the caller is told plainly and the person types the area
// and city themselves; nothing else in the app depends on it. The text people search for is never written to the log.
const env = require('../../config/env');
const logger = require('../../utils/logger');
const ApiError = require('../../utils/ApiError');

const MIN_GAP_MS = env.isTest ? 0 : 1100; // Nominatim: one request per second, with a little room
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED = 500;
const TIMEOUT_MS = 6000;

const cache = new Map(); // key -> { at, value }
let chain = Promise.resolve();
let lastCall = 0;
let fetchImpl = (...args) => fetch(...args); // tests replace it

/** For tests. */
const _reset = () => { cache.clear(); chain = Promise.resolve(); lastCall = 0; };
const _setFetch = (fn) => { fetchImpl = fn || ((...args) => fetch(...args)); };

const unavailable = () => new ApiError(503, 'Address search is unavailable right now. Please enter the area and city yourself.', 'GEOCODER_UNAVAILABLE');

function remember(key, value) {
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value); // the oldest
  cache.set(key, { at: Date.now(), value });
  return value;
}
function recall(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) { cache.delete(key); return null; }
  return hit.value;
}

/** Runs `job` after the ones before it, with at least MIN_GAP_MS between upstream calls. */
function queued(job) {
  const run = chain.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try { return await job(); } finally { lastCall = Date.now(); }
  });
  chain = run.catch(() => {}); // one failure must not block the queue
  return run;
}

async function call(path, params) {
  const url = `${env.NOMINATIM_BASE_URL.replace(/\/+$/, '')}${path}?${new URLSearchParams({ format: 'jsonv2', addressdetails: '1', 'accept-language': 'en', ...params })}`;
  const headers = { 'User-Agent': env.NOMINATIM_USER_AGENT, Accept: 'application/json', ...(env.NOMINATIM_CONTACT_EMAIL ? { From: env.NOMINATIM_CONTACT_EMAIL } : {}) };
  try {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'geocoder answered with an error');
      throw unavailable();
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.warn({ reason: err?.name || 'error' }, 'geocoder could not be reached');
    throw unavailable();
  }
}

const round5 = (n) => Math.round(Number(n) * 1e5) / 1e5;

/** One Nominatim result as the app uses it: where, and the area and city to fill in. */
function shape(r) {
  const a = r.address || {};
  return {
    label: String(r.display_name || '').slice(0, 200),
    lat: round5(r.lat),
    lng: round5(r.lon),
    area: a.suburb || a.neighbourhood || a.city_district || a.quarter || a.hamlet || a.village || '',
    city: a.city || a.town || a.village || a.municipality || a.county || a.state_district || '',
    state: a.state || '',
    postcode: a.postcode || '',
  };
}
const valid = (r) => r && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon));

/** Places matching a typed address, in India, at most five. */
async function search(text) {
  const q = String(text || '').trim().replace(/\s+/g, ' ');
  if (q.length < 3 || q.length > 120) throw ApiError.validation([{ field: 'q', message: 'Type between 3 and 120 characters' }]);
  const key = `s:${q.toLowerCase()}`;
  const hit = recall(key);
  if (hit) return hit;
  const rows = await queued(() => call('/search', { q, limit: '5', countrycodes: 'in' }));
  return remember(key, (Array.isArray(rows) ? rows : []).filter(valid).map(shape));
}

/** The area and city for a point (for "use my location" and the map pin). `null` when nothing is known there. */
async function reverse(lat, lng) {
  const key = `r:${lat.toFixed(3)},${lng.toFixed(3)}`; // about 100 m: close points share an answer
  const hit = recall(key);
  if (hit !== null) return hit.none ? null : hit;
  const row = await queued(() => call('/reverse', { lat: String(lat), lon: String(lng), zoom: '16' }));
  const value = valid(row) ? shape(row) : null;
  remember(key, value || { none: true });
  return value;
}

module.exports = { search, reverse, _reset, _setFetch };