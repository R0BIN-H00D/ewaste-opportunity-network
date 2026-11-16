'use strict';
// Shapes a RefurbishmentJob for one viewer. The exact device location goes to the owner and admin, and to the
// refurbisher only while their offer is accepted and the device is not yet collected (BR-08).
const { availableActions, photoStagesFor, NEXT } = require('../services/workflow/refurbishment');

const idOf = (v) => String(v && v._id ? v._id : v);

function serializeListing(listing, showExact) {
  if (!listing || !listing._id) return listing;
  return {
    _id: listing._id,
    title: listing.title,
    brand: listing.brand,
    model: listing.model,
    condition: listing.condition,
    description: listing.description,
    category: listing.category,
    addressArea: listing.addressArea,
    city: listing.city,
    device: { photos: listing.device?.photos || [] },
    publicLocation: listing.publicLocation,
    ...(showExact && listing.location ? { location: listing.location } : {}),
  };
}

/** One reusable device in the refurbisher's feed. Only the fuzzed public location is ever shown here. */
function serializeOpportunity(listing, { hasOffered = false } = {}) {
  return { ...serializeListing(listing, false), preferredService: listing.preferredService, listedAt: listing.createdAt, hasOffered };
}

/**
 * @param j    populated job (listing, owner, refurbisher, pickup)
 * @param ctx  { role, profile }  profile = the refurbisher's business profile
 */
function serializeJob(j, { role, profile, detail = true }) {
  const confirmations = j.confirmations || {};
  const showExact = role === 'owner' || role === 'admin' || (role === 'refurbisher' && j.status === 'accepted');
  const confirmedByMe = role === 'owner' ? Boolean(confirmations.ownerAt) : role === 'refurbisher' ? Boolean(confirmations.refurbisherAt) : false;
  const handoverStarted = Boolean(confirmations.ownerAt || confirmations.refurbisherAt);

  const out = {
    _id: j._id,
    status: j.status,
    offer: { amount: j.offer?.amount ?? 0, message: j.offer?.message, status: j.offer?.status },
    listing: serializeListing(j.listing, showExact),
    owner: j.owner && j.owner._id ? { _id: j.owner._id, name: j.owner.name, avatar: j.owner.avatar } : { _id: idOf(j.owner) },
    refurbisher: {
      ...(j.refurbisher && j.refurbisher._id ? { _id: j.refurbisher._id, name: j.refurbisher.name, avatar: j.refurbisher.avatar } : { _id: idOf(j.refurbisher) }),
      ...(profile ? { businessName: profile.businessName, city: profile.city } : {}),
    },
    viewerRole: role,
    beforePhotos: j.beforePhotos || [],
    afterPhotos: j.afterPhotos || [],
    product: j.product ? idOf(j.product) : null,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };
  if (!detail) return out;

  out.pickup = j.pickup && j.pickup._id
    ? { date: j.pickup.date, timeSlot: j.pickup.timeSlot, notes: j.pickup.notes, status: j.pickup.status, rescheduleCount: j.pickup.rescheduleCount }
    : null;
  out.confirmations = { owner: Boolean(confirmations.ownerAt), refurbisher: Boolean(confirmations.refurbisherAt), checklistAcknowledged: Boolean(confirmations.checklistAcknowledgedAt) };
  out.workLog = (j.workLog || []).map((w) => ({ text: w.text, at: w.at }));
  out.history = (j.history || []).map((h) => ({ status: h.status, at: h.at, note: h.note }));
  if (j.status === 'cancelled') out.cancelReason = j.cancelReason;
  out.actions = availableActions(j, role, { hasPickup: Boolean(j.pickup), handoverStarted, confirmedByMe });
  if (role === 'refurbisher') {
    out.photoStages = photoStagesFor(j.status);
    out.nextStatus = NEXT[j.status] || null;
  }
  return out;
}

module.exports = { serializeJob, serializeOpportunity };
