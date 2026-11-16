'use strict';
// Shapes a ServiceRequest for one viewer. The exact device location is released to the technician only after they
// accept the job (BR-08); `actions` tells clients which buttons to show so the rules live in one place.
const { availableActions } = require('../services/workflow/serviceRequest');

const idOf = (v) => String(v && v._id ? v._id : v);
const NO_ADDRESS_STATUSES = ['request_submitted', 'rejected', 'cancelled'];

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
    status: listing.status,
    device: { photos: listing.device?.photos || [] },
    publicLocation: listing.publicLocation,
    ...(showExact && listing.location ? { location: listing.location } : {}),
  };
}

function serializeRequest(r, { role, invited = false }) {
  const showExact = role === 'admin' || role === 'customer' || (role === 'technician' && !invited && !NO_ADDRESS_STATUSES.includes(r.status));
  return {
    _id: r._id,
    status: r.status,
    mode: r.mode,
    onSite: Boolean(r.onSite),
    issueDescription: r.issueDescription,
    listing: serializeListing(r.listing, showExact),
    customer: r.customer && r.customer._id ? { _id: r.customer._id, name: r.customer.name, avatar: r.customer.avatar } : r.customer,
    technician: r.technician && r.technician._id ? { _id: r.technician._id, name: r.technician.name, avatar: r.technician.avatar } : r.technician || null,
    activeQuotation: r.activeQuotation || null,
    statusHistory: (r.statusHistory || []).map((h) => ({ status: h.status, at: h.at, note: h.note, photos: h.photos, by: h.by ? idOf(h.by) : undefined })),
    diagnosisNotes: r.diagnosisNotes,
    repairNotes: r.repairNotes || [],
    progressPhotos: r.progressPhotos || [],
    completionPhotos: r.completionPhotos || [],
    handover: {
      collect: { owner: Boolean(r.handover?.collect?.byOwner), provider: Boolean(r.handover?.collect?.byProvider), checklistAcknowledged: Boolean(r.handover?.collect?.checklistAcknowledgedAt) },
      delivery: { owner: Boolean(r.handover?.delivery?.byOwner), provider: Boolean(r.handover?.delivery?.byProvider) },
    },
    pickup: r.pickup && r.pickup._id ? { date: r.pickup.date, timeSlot: r.pickup.timeSlot, status: r.pickup.status, rescheduleCount: r.pickup.rescheduleCount } : null,
    returnSchedule: r.returnSchedule?.date ? { date: r.returnSchedule.date, timeSlot: r.returnSchedule.timeSlot } : null,
    customerConfirmedAt: r.customerConfirmedAt,
    reviewed: Boolean(r.reviewed),
    viewerRole: role,
    actions: availableActions(r, role, { invited }),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

module.exports = { serializeRequest };
