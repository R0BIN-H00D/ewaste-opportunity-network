'use strict';
const EARTH_RADIUS_KM = 6378.1;
const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km between two [lng, lat] points. */
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// Small deterministic hash -> [0,1) so the same seed always fuzzes the same way.
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Privacy fuzzing (BR-08 / FR-MAP-006). Snap to a ~1 km grid (2 decimals) FIRST, then add a deterministic
 * offset of 0.001-0.004 deg (~110-440 m, never zero) seeded by `seed`. Offsetting after rounding guarantees the
 * published point can never equal the exact one, even if the user typed coordinates that already sit on the grid.
 */
function fuzzPoint(point, seed = '') {
  if (!point || !Array.isArray(point.coordinates)) return undefined;
  const [lng, lat] = point.coordinates;
  const grid = (n) => Math.round(n * 100) / 100;
  const offset = (key) => {
    const h = hash01(`${seed}:${key}`); // [0,1)
    const sign = h < 0.5 ? -1 : 1;
    return sign * (0.001 + 0.003 * (h < 0.5 ? h * 2 : (h - 0.5) * 2));
  };
  const r5 = (n) => Math.round(n * 1e5) / 1e5;
  return { type: 'Point', coordinates: [r5(grid(lng) + offset('lng')), r5(grid(lat) + offset('lat'))] };
}

const makePoint = (lng, lat) => ({ type: 'Point', coordinates: [Number(lng), Number(lat)] });

/** $geoWithin clause: within radiusKm of (lng,lat). Works together with other filters and sorts. */
const withinRadius = (lng, lat, radiusKm) => ({ $geoWithin: { $centerSphere: [[lng, lat], radiusKm / EARTH_RADIUS_KM] } });

module.exports = { haversineKm, fuzzPoint, makePoint, withinRadius };
