'use strict';
// Pure scoring functions: no database access, so they are easy to test. Each scorer returns
// { value: 0..1, reason?: string }. Register a new scorer by adding it to SCORERS and giving it a weight in config/matching.js.
const cfg = require('../../config/matching');
const { haversineKm } = require('../../utils/geo');

const idStr = (v) => String(v && v._id ? v._id : v);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const DAY_MS = 24 * 60 * 60 * 1000;

/** Straight-line distance between the technician's service base and the device, or null when either is unknown. */
function distanceBetween(profile, listing) {
  const a = profile?.serviceLocation?.coordinates;
  const b = listing?.location?.coordinates;
  return a && b ? haversineKm(a, b) : null;
}

const SCORERS = [
  {
    key: 'category',
    label: 'Device type fit',
    score(c, ctx) {
      const cats = (c.profile.deviceCategories || []).map(idStr);
      if (cats.length === 0) return { value: 0.5, reason: 'Repairs a wide range of devices' };
      return cats.includes(idStr(ctx.listing.category)) ? { value: 1, reason: 'Specialises in this type of device' } : { value: 0 };
    },
  },
  {
    key: 'proximity',
    label: 'Distance',
    score(c) {
      if (c.distanceKm == null) return { value: 0.5 };
      const radius = c.profile.serviceRadiusKm || cfg.defaultSearchRadiusKm;
      const km = Math.round(c.distanceKm * 10) / 10;
      return { value: clamp01(1 - c.distanceKm / radius), reason: km < 1 ? 'Less than 1 km away' : `About ${km} km away` };
    },
  },
  {
    key: 'rating',
    label: 'Customer rating',
    score(c) {
      const { ratingAvg = 0, ratingCount = 0 } = c.profile;
      const { mean, weight } = cfg.ratingPrior;
      const smoothed = (ratingAvg * ratingCount + mean * weight) / (ratingCount + weight);
      return { value: clamp01(smoothed / 5), reason: ratingCount >= 3 ? `Rated ${ratingAvg.toFixed(1)} from ${ratingCount} reviews` : undefined };
    },
  },
  {
    key: 'availability',
    label: 'Availability',
    score(c) {
      const status = c.profile.availability?.status || 'available';
      if (status === 'available') return { value: 1, reason: 'Available now' };
      return { value: status === 'limited' ? 0.5 : 0 };
    },
  },
  {
    key: 'condition',
    label: 'Suits the device condition',
    score(c, ctx) {
      const condition = ctx.listing.condition;
      const years = c.profile.experienceYears || 0;
      if (condition === 'major_damage' || condition === 'not_working') {
        return years >= 3 ? { value: 1, reason: `${years} years of experience with difficult repairs` } : { value: 0.5 };
      }
      if (condition === 'for_spare_parts') return { value: 0.5 };
      return { value: 1 };
    },
  },
  {
    key: 'experience',
    label: 'Completed jobs',
    score(c) {
      const jobs = c.profile.completedJobs || 0;
      return { value: clamp01(Math.log10(1 + jobs) / Math.log10(51)), reason: jobs >= 5 ? `${jobs} completed jobs` : undefined };
    },
  },
  {
    key: 'freshness',
    label: 'Recently verified',
    score(c, ctx) {
      const at = c.profile.verification?.reviewedAt;
      if (!at) return { value: 0.5 };
      const days = (ctx.now - new Date(at).getTime()) / DAY_MS;
      return { value: clamp01(1 - days / cfg.freshnessDays) };
    },
  },
];

/**
 * Hard filters. A technician who fails any of these is never shown or scored (BR-01, FR-MATCH-002).
 * Returns { ok: true } or { ok: false, why }.
 */
function checkEligibility(c, ctx) {
  const { profile, user } = c;
  if (!user || user.status !== 'active') return { ok: false, why: 'account_not_active' };
  if (profile.verification?.status !== 'approved') return { ok: false, why: 'not_verified' };
  if (String(user._id) === String(ctx.listing.owner)) return { ok: false, why: 'own_listing' };
  if ((profile.availability?.status || 'available') === 'unavailable') return { ok: false, why: 'unavailable' };
  const cats = (profile.deviceCategories || []).map(idStr);
  if (cats.length > 0 && !cats.includes(idStr(ctx.listing.category))) return { ok: false, why: 'category_not_accepted' };
  const radius = profile.serviceRadiusKm || cfg.defaultSearchRadiusKm;
  if (c.distanceKm != null && c.distanceKm > radius) return { ok: false, why: 'outside_service_radius' };
  return { ok: true };
}

/** "Roughly what would this cost?" Always labelled an estimate; null when the technician set no base rate. */
function estimateCharge(profile, condition) {
  if (!profile.baseRate) return null;
  const multiplier = cfg.conditionMultiplier[condition] ?? 1;
  return { amount: Math.round(profile.baseRate * multiplier), currency: 'INR', isEstimate: true };
}

function scoreCandidate(c, ctx, weights = cfg.weights) {
  const breakdown = [];
  const reasons = [];
  let total = 0;
  for (const scorer of SCORERS) {
    const weight = weights[scorer.key] ?? 0;
    const { value, reason } = scorer.score(c, ctx);
    const points = Math.round(weight * value * 10) / 10;
    breakdown.push({ key: scorer.key, label: scorer.label, weight, value: Math.round(value * 100) / 100, points });
    if (reason && value > 0) reasons.push(reason);
    total += weight * value;
  }
  return { score: Math.round(total * 10) / 10, breakdown, reasons };
}

/**
 * candidates: [{ profile, user }]. ctx: { listing: { owner, category, condition, location }, now? }.
 * Returns eligible candidates sorted by score (ties: nearer first), each with score, breakdown, reasons, estimate.
 */
function rankCandidates(candidates, ctx, { weights = cfg.weights, limit = cfg.maxResults } = {}) {
  const context = { ...ctx, now: ctx.now || Date.now() };
  const ranked = [];
  for (const raw of candidates) {
    const c = { ...raw, distanceKm: distanceBetween(raw.profile, context.listing) };
    if (!checkEligibility(c, context).ok) continue;
    ranked.push({
      ...c,
      ...scoreCandidate(c, context, weights),
      estimatedCharge: estimateCharge(c.profile, context.listing.condition),
    });
  }
  ranked.sort((a, b) => b.score - a.score || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  return ranked.slice(0, limit);
}

module.exports = { SCORERS, distanceBetween, checkEligibility, estimateCharge, scoreCandidate, rankCandidates };
