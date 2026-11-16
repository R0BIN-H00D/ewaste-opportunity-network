'use strict';
// Database side of matching: pick candidate providers, then hand them to the pure scorers.
const TechnicianProfile = require('../../models/TechnicianProfile');
const User = require('../../models/User');
const cfg = require('../../config/matching');
const scorers = require('./scorers');
const { serializeTechnician } = require('../../serializers/technician');

/** Technician profiles that could possibly serve this listing (cheap DB pre-filter; exact rules run in JS). */
async function loadTechnicianCandidates(listing) {
  const profiles = await TechnicianProfile.find({
    'verification.status': 'approved',
    'availability.status': { $ne: 'unavailable' },
    $or: [{ deviceCategories: { $size: 0 } }, { deviceCategories: listing.category }],
  })
    .populate('deviceCategories', 'name slug')
    .limit(cfg.maxCandidates)
    .lean();
  const users = await User.find({ _id: { $in: profiles.map((p) => p.user) }, role: 'technician', status: 'active' })
    .select('name avatar status role')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return profiles.map((profile) => ({ profile, user: byId.get(String(profile.user)) })).filter((c) => c.user);
}

/** Ranked technicians for a device listing, with scores, reasons and a labelled price estimate (FR-MATCH-001..006). */
async function recommendTechnicians(listing, { limit = cfg.maxResults } = {}) {
  const candidates = await loadTechnicianCandidates(listing);
  const ranked = scorers.rankCandidates(candidates, { listing }, { limit });
  return ranked.map((r) => ({
    technician: serializeTechnician(r.profile, r.user, { distanceKm: r.distanceKm }),
    score: r.score,
    breakdown: r.breakdown,
    reasons: r.reasons,
    estimatedCharge: r.estimatedCharge,
  }));
}

module.exports = { recommendTechnicians, loadTechnicianCandidates, ...scorers };
