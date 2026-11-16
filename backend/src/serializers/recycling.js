'use strict';
// Shapes recycling centres and requests. Centres are public businesses; requests are private to the two sides.
// The exact pickup address goes to the requester and admin, and to the centre only until the goods are collected (BR-08).
// Actual and estimated weights are always kept apart (BR-06).
const { availableActions, ADDRESS_VISIBLE_TO_CENTER } = require('../services/workflow/recycling');

const idOf = (v) => String(v && v._id ? v._id : v);
const sum = (list, key) => Math.round(list.reduce((t, m) => t + (typeof m[key] === 'number' ? m[key] : 0), 0) * 1000) / 1000;

/** `authorized` is true when verification is approved and the authorisation has not run out. */
const isAuthorized = (c, now = new Date()) => c.verification?.status === 'approved' && (!c.validUntil || new Date(c.validUntil) > now);

function serializeCenter(c, { detail = false } = {}) {
  const out = {
    _id: c._id,
    name: c.name,
    city: c.city,
    authorized: isAuthorized(c),
    authorizationNo: c.authorizationNo,
    authorizingBody: c.authorizingBody,
    validUntil: c.validUntil,
    acceptedCategories: (c.acceptedCategories || []).map((x) => (x && x._id ? { _id: x._id, name: x.name, slug: x.slug, icon: x.icon } : { _id: x })),
    operatingHours: c.operatingHours,
    ratingAvg: c.ratingAvg || 0,
    ratingCount: c.ratingCount || 0,
    location: c.location,
  };
  if (detail) {
    out.facilityDetails = c.facilityDetails;
    out.collectionAreas = (c.collectionLocations || []).map((l) => ({ label: l.label, addressArea: l.addressArea }));
    out.totals = { actualKg: c.totals?.actualKg || 0, estimatedKg: c.totals?.estimatedKg || 0 };
  }
  return out;
}

const serializeMaterial = (m) => ({ type: m.type, actualKg: m.actualKg ?? null, estimatedKg: m.estimatedKg ?? null, measuredAt: m.measuredAt });

/** @param r populated request (center, requester, categories, listing, pickup)   @param ctx { role, detail } */
function serializeRequest(r, { role, detail = true }) {
  const handover = r.handover || {};
  const showExact = role === 'requester' || role === 'admin' || (role === 'center' && ADDRESS_VISIBLE_TO_CENTER.includes(r.status));
  const out = {
    _id: r._id,
    refNo: r.refNo,
    status: r.status,
    viewerRole: role,
    categories: (r.categories || []).map((c) => (c && c._id ? { _id: c._id, name: c.name, slug: c.slug, icon: c.icon } : { _id: c })),
    deviceCount: r.deviceCount,
    photos: r.photos || [],
    pickupAddressArea: r.pickupAddressArea,
    ...(showExact && r.pickupAddress ? { pickupAddress: r.pickupAddress } : {}),
    preferredDate: r.preferredDate,
    notes: r.notes,
    center: r.center && r.center._id ? { _id: r.center._id, name: r.center.name, city: r.center.city } : { _id: idOf(r.center) },
    requester: r.requester && r.requester._id ? { _id: r.requester._id, name: r.requester.name, avatar: r.requester.avatar } : { _id: idOf(r.requester) },
    listing: r.listing && r.listing._id ? { _id: r.listing._id, title: r.listing.title } : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
  if (!detail) return out;

  const materials = (r.materials || []).map(serializeMaterial);
  out.pickup = r.pickup && r.pickup._id
    ? { date: r.pickup.date, timeSlot: r.pickup.timeSlot, notes: r.pickup.notes, status: r.pickup.status, rescheduleCount: r.pickup.rescheduleCount }
    : null;
  out.confirmations = { requester: Boolean(handover.byUser), center: Boolean(handover.byCenter), checklistAcknowledged: Boolean(r.checklistAcknowledgedAt) };
  out.receivedAt = r.receivedAt;
  out.completedAt = r.completedAt;
  out.materials = materials;
  // Totals keep the two kinds of number separate, never merged (BR-06).
  out.totals = { actualKg: sum(materials, 'actualKg'), estimatedKg: sum(materials, 'estimatedKg') };
  out.reportNotes = r.reportNotes;
  out.history = (r.history || []).map((h) => ({ status: h.status, at: h.at, note: h.note }));
  if (r.status === 'cancelled' || r.status === 'rejected') out.cancelReason = r.cancelReason;
  const confirmedByMe = role === 'requester' ? Boolean(handover.byUser) : role === 'center' ? Boolean(handover.byCenter) : false;
  out.actions = availableActions(r, role, { handoverStarted: Boolean(handover.byUser || handover.byCenter), confirmedByMe, hasMaterials: materials.length > 0 });
  return out;
}

module.exports = { serializeCenter, serializeRequest, isAuthorized };
