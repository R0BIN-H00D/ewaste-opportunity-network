'use strict';
const { isValidObjectId } = require('mongoose');
const TechnicianProfile = require('../models/TechnicianProfile');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { haversineKm, withinRadius } = require('../utils/geo');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { serializeTechnician } = require('../serializers/technician');
const { resolveCategory } = require('./deviceService');
const cfg = require('../config/matching');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MAX_GEO_RESULTS = 200;

const activeTechnicianIds = async () => (await User.find({ role: 'technician', status: 'active' }).select('_id').lean()).map((u) => u._id);

async function attachUsers(profiles) {
  const users = await User.find({ _id: { $in: profiles.map((p) => p.user) } }).select('name avatar').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return profiles.map((p) => ({ profile: p, user: byId.get(String(p.user)) })).filter((x) => x.user);
}

const SORTS = {
  rating: { ratingAvg: -1, ratingCount: -1, completedJobs: -1, createdAt: -1 },
  experience: { completedJobs: -1, experienceYears: -1, createdAt: -1 },
  newest: { createdAt: -1 },
};

/** Public directory of verified technicians (FR-MATCH-007). Unverified, suspended or deleted providers never appear (BR-01). */
async function listTechnicians(query) {
  const and = [{ 'verification.status': 'approved' }, { user: { $in: await activeTechnicianIds() } }];

  if (query.available === 'true') and.push({ 'availability.status': { $ne: 'unavailable' } });
  if (query.category) {
    const cat = await resolveCategory(query.category);
    and.push({ $or: [{ deviceCategories: { $size: 0 } }, { deviceCategories: cat._id }] });
  }
  if (query.city) and.push({ city: new RegExp(`^${escapeRegex(query.city)}$`, 'i') });
  if (query.minRating !== undefined) and.push({ ratingAvg: { $gte: query.minRating } });
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    const nameMatches = await User.find({ role: 'technician', status: 'active', name: rx }).select('_id').limit(200).lean();
    and.push({ $or: [{ headline: rx }, { specializations: rx }, { city: rx }, { user: { $in: nameMatches.map((u) => u._id) } }] });
  }

  const pg = parsePagination(query, { defaultLimit: 12 });
  const hasPoint = query.lat !== undefined;

  if (!hasPoint) {
    const sort = SORTS[query.sort] || SORTS.rating;
    const filter = { $and: and };
    const [profiles, total] = await Promise.all([
      TechnicianProfile.find(filter).sort(sort).skip(pg.skip).limit(pg.limit).populate('deviceCategories', 'name slug').lean(),
      TechnicianProfile.countDocuments(filter),
    ]);
    const rows = await attachUsers(profiles);
    return { items: rows.map((r) => serializeTechnician(r.profile, r.user)), meta: buildMeta(pg, total) };
  }

  // Searching around a point: distance is computed here so results can be sorted and labelled by it.
  and.push({ serviceLocation: withinRadius(query.lng, query.lat, query.radiusKm || cfg.defaultSearchRadiusKm) });
  const profiles = await TechnicianProfile.find({ $and: and }).limit(MAX_GEO_RESULTS).populate('deviceCategories', 'name slug').lean();
  const rows = (await attachUsers(profiles)).map((r) => ({ ...r, distanceKm: haversineKm(r.profile.serviceLocation.coordinates, [query.lng, query.lat]) }));
  const by = {
    distance: (a, b) => a.distanceKm - b.distanceKm,
    experience: (a, b) => b.profile.completedJobs - a.profile.completedJobs,
    rating: (a, b) => b.profile.ratingAvg - a.profile.ratingAvg || a.distanceKm - b.distanceKm,
  };
  rows.sort(by[query.sort] || by.distance);
  const page = rows.slice(pg.skip, pg.skip + pg.limit);
  return { items: page.map((r) => serializeTechnician(r.profile, r.user, { distanceKm: r.distanceKm })), meta: buildMeta(pg, rows.length) };
}

async function getTechnician(id) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Technician not found');
  const user = await User.findOne({ _id: id, role: 'technician', status: 'active' }).select('name avatar').lean();
  const profile = user && (await TechnicianProfile.findOne({ user: id, 'verification.status': 'approved' }).populate('deviceCategories', 'name slug').lean());
  if (!profile) throw ApiError.notFound('Technician not found');
  return serializeTechnician(profile, user);
}

async function setAvailability(user, status) {
  const profile = await TechnicianProfile.findOneAndUpdate({ user: user.id }, { $set: { 'availability.status': status } }, { new: true });
  if (!profile) throw ApiError.notFound('Technician profile not found');
  return { availability: { status: profile.availability.status } };
}

module.exports = { listTechnicians, getTechnician, setAvailability };
