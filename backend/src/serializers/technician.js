'use strict';
// Public view of a technician. Never includes the exact service base location, earnings, contact details or documents.
const idOf = (v) => String(v && v._id ? v._id : v);

function serializeTechnician(profile, user, { distanceKm } = {}) {
  return {
    _id: idOf(user), // the technician's user id is the public identifier
    name: user.name,
    avatar: user.avatar,
    headline: profile.headline,
    experienceYears: profile.experienceYears,
    qualifications: profile.qualifications,
    specializations: profile.specializations,
    categories: (profile.deviceCategories || []).map((c) => (c && c.name ? { _id: c._id, name: c.name, slug: c.slug } : { _id: c })),
    serviceAddressArea: profile.serviceAddressArea,
    city: profile.city,
    serviceRadiusKm: profile.serviceRadiusKm,
    baseRate: profile.baseRate,
    availability: { status: profile.availability?.status || 'available' },
    ratingAvg: profile.ratingAvg || 0,
    ratingCount: profile.ratingCount || 0,
    completedJobs: profile.completedJobs || 0,
    distanceKm: distanceKm == null ? undefined : Math.round(distanceKm * 10) / 10,
  };
}

module.exports = { serializeTechnician };
