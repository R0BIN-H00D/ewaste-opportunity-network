'use strict';
// Smart matching beyond technicians: refurbishers and recycling centres for a device, and the wanted requests a device
// would satisfy. Plain, explainable scoring (each answer says why), in the same style as the technician matching.
const RefurbisherProfile = require('../../models/RefurbisherProfile');
const RecyclingCenter = require('../../models/RecyclingCenter');
const WantedRequest = require('../../models/WantedRequest');
const User = require('../../models/User');
const cfg = require('../../config/matching');
const { CONDITIONS } = require('../../config/constants');
const { haversineKm } = require('../../utils/geo');

const idStr = (v) => String(v && v._id ? v._id : v);
const coords = (p) => (p && Array.isArray(p.coordinates) && p.coordinates.length === 2 ? p.coordinates : null);
const sameCity = (a, b) => Boolean(a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase());
const CONDITION_RANK = Object.fromEntries(CONDITIONS.map((c, i) => [c, CONDITIONS.length - i])); // fully_working is best

function smoothedRating(avg = 0, count = 0) {
  const { mean, weight } = cfg.ratingPrior;
  return (avg * count + mean * weight) / (count + weight); // 0..5
}

function distanceKm(listing, location) {
  const a = coords(listing.location);
  const b = coords(location);
  return a && b ? Math.round(haversineKm(a, b) * 10) / 10 : null;
}

/** 30 points for the right category, 30 for being near (or in the same city), 25 for rating, 15 for a verified record. */
function scoreProvider({ accepts, listing, location, city, ratingAvg, ratingCount, hazardousOk }) {
  const reasons = [];
  let score = 0;
  if (accepts) { score += 30; reasons.push('Takes this kind of device'); }
  const km = distanceKm(listing, location);
  if (km != null) {
    score += Math.max(0, 30 * (1 - Math.min(km, 50) / 50));
    reasons.push(`${km} km away`);
  } else if (sameCity(city, listing.city)) {
    score += 18;
    reasons.push(`In ${listing.city}`);
  }
  if (ratingCount > 0) {
    score += 25 * (smoothedRating(ratingAvg, ratingCount) / 5);
    reasons.push(`${Number(ratingAvg).toFixed(1)} stars from ${ratingCount} review${ratingCount === 1 ? '' : 's'}`);
  }
  if (hazardousOk) { score += 15; reasons.push('Handles hazardous parts safely'); }
  return { score: Math.round(score * 10) / 10, reasons, distanceKm: km };
}

async function refurbishersFor(listing, { limit = 10 } = {}) {
  const profiles = await RefurbisherProfile.find({ 'verification.status': 'approved', $or: [{ categories: { $size: 0 } }, { categories: listing.category }] }).limit(cfg.maxCandidates).lean();
  const users = await User.find({ _id: { $in: profiles.map((p) => p.user) }, status: 'active', role: 'refurbisher' }).select('name avatar').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return profiles
    .filter((p) => byId.has(String(p.user)) && String(p.user) !== String(listing.owner))
    .map((p) => {
      const accepts = (p.categories || []).length === 0 || p.categories.map(idStr).includes(idStr(listing.category));
      const s = scoreProvider({ accepts, listing, location: p.location, city: p.city, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount });
      return { kind: 'refurbisher', id: String(p.user), name: p.businessName, city: p.city, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, ...s };
    })
    .sort((a, b) => b.score - a.score || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
    .slice(0, limit);
}

async function recyclersFor(listing, { limit = 10, hazardous = false } = {}) {
  const now = new Date();
  const centers = await RecyclingCenter.find({ 'verification.status': 'approved', acceptedCategories: listing.category, $or: [{ validUntil: { $exists: false } }, { validUntil: null }, { validUntil: { $gt: now } }] }).limit(cfg.maxCandidates).lean();
  const users = await User.find({ _id: { $in: centers.map((c) => c.user) }, status: 'active' }).select('_id').lean();
  const active = new Set(users.map((u) => String(u._id)));
  return centers
    .filter((c) => active.has(String(c.user)))
    .map((c) => {
      const s = scoreProvider({ accepts: true, listing, location: c.location, city: c.city, ratingAvg: c.ratingAvg, ratingCount: c.ratingCount, hazardousOk: hazardous && Boolean(c.authorizationNo) });
      return { kind: 'recycler', id: String(c.user), name: c.name, city: c.city, ratingAvg: c.ratingAvg, ratingCount: c.ratingCount, ...s };
    })
    .sort((a, b) => b.score - a.score || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
    .slice(0, limit);
}

/** Open wanted requests this device would satisfy: category 40, brand 20, good-enough condition 20, same city 15, quantity room 5. */
async function wantedFor(listing, { limit = 10 } = {}) {
  const open = await WantedRequest.find({ status: 'open', $or: [{ category: listing.category }, { category: { $exists: false } }, { category: null }] })
    .populate('category', 'name slug').populate('refurbisher', 'name').sort({ createdAt: -1 }).limit(200).lean();
  return open
    .filter((w) => String(idStr(w.refurbisher)) !== String(listing.owner))
    .map((w) => {
      const reasons = [];
      let score = 0;
      if (w.category) { score += 40; reasons.push(`Wants ${w.category.name}`); } else { score += 15; reasons.push('Wants any kind of device'); }
      if (w.brand && listing.brand && w.brand.trim().toLowerCase() === listing.brand.trim().toLowerCase()) { score += 20; reasons.push(`Looking for ${w.brand}`); }
      if (!w.minCondition) { score += 10; } else if ((CONDITION_RANK[listing.condition] || 0) >= (CONDITION_RANK[w.minCondition] || 0)) { score += 20; reasons.push('Your device is in the condition they want'); } else { return null; }
      if (sameCity(w.city, listing.city)) { score += 15; reasons.push(`In ${listing.city}`); }
      if (w.quantity > 1) { score += 5; reasons.push(`Wants ${w.quantity} devices`); }
      return { kind: 'wanted', id: String(w._id), title: w.title, city: w.city, refurbisher: { _id: idStr(w.refurbisher), name: w.refurbisher?.name }, score, reasons };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = { refurbishersFor, recyclersFor, wantedFor, scoreProvider };
