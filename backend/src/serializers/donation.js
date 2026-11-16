'use strict';
// Shapes a Donation for one viewer. The exact device location goes only to the donor, an admin, or the accepted
// recipient until the handover is done (BR-08). Strangers see a first name and last initial of the donor.
const { availableActions } = require('../services/workflow/donation');

const idOf = (v) => String(v && v._id ? v._id : v);
const shortName = (name = '') => {
  const [first, ...rest] = String(name).trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first || 'Donor';
};

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

const orgOf = (profile) => (profile?.orgProfile?.isOrg ? { orgName: profile.orgProfile.orgName, orgType: profile.orgProfile.orgType } : {});

/** One recipient request as the donor sees it. `profiles` maps user id -> UserProfile (organisation details). */
function serializeRequestRow(r, profiles) {
  const requester = r.requester && r.requester._id ? r.requester : { _id: r.requester };
  return {
    _id: r._id,
    status: r.status,
    justification: r.justification,
    intendedUse: r.intendedUse,
    requester: { _id: requester._id, name: requester.name, ...orgOf(profiles.get(idOf(requester))) },
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
  };
}

/**
 * @param d       populated donation (listing, donor, acceptedRequest.requester, pickup)
 * @param ctx     { role, myRequest, requests, profiles, canRequest, detail }
 */
function serializeDonation(d, ctx) {
  const { role, myRequest, requests, profiles = new Map(), canRequest = false, detail = true } = ctx;
  const participant = ['donor', 'recipient', 'admin'].includes(role);
  const showExact = role === 'donor' || role === 'admin' || (role === 'recipient' && ['accepted', 'handover_scheduled'].includes(d.status));
  const donorId = idOf(d.donor);
  const confirmations = d.confirmations || {};
  const recipientUser = d.acceptedRequest?.requester && d.acceptedRequest.requester._id ? d.acceptedRequest.requester : null;

  const out = {
    _id: d._id,
    status: d.status,
    description: d.description,
    listing: serializeListing(d.listing, showExact),
    donor: d.donor && d.donor._id ? { _id: d.donor._id, name: participant ? d.donor.name : shortName(d.donor.name), avatar: d.donor.avatar } : { _id: donorId },
    viewerRole: role,
    myRequest: myRequest ? { _id: myRequest._id, status: myRequest.status, justification: myRequest.justification, intendedUse: myRequest.intendedUse } : null,
    createdAt: d.createdAt,
  };

  if (role === 'donor' || role === 'admin') out.pendingRequests = (requests || []).filter((r) => r.status === 'pending').length;
  if (!detail) return out;

  const confirmedByMe = role === 'donor' ? Boolean(confirmations.donorAt) : role === 'recipient' ? Boolean(confirmations.recipientAt) : false;
  if (participant) {
    if (recipientUser) out.recipient = { _id: recipientUser._id, name: recipientUser.name, ...orgOf(profiles.get(idOf(recipientUser))) };
    out.pickup = d.pickup && d.pickup._id
      ? { date: d.pickup.date, timeSlot: d.pickup.timeSlot, notes: d.pickup.notes, status: d.pickup.status, rescheduleCount: d.pickup.rescheduleCount }
      : null;
    out.confirmations = { donor: Boolean(confirmations.donorAt), recipient: Boolean(confirmations.recipientAt), checklistAcknowledged: Boolean(confirmations.checklistAcknowledgedAt) };
    out.history = (d.history || []).map((h) => ({ status: h.status, at: h.at, note: h.note }));
    if (d.status === 'cancelled') out.cancelReason = d.cancelReason;
  }
  if (d.status === 'completed' && participant) out.confirmation = { refNo: d.confirmation?.refNo, issuedAt: d.confirmation?.issuedAt };
  if ((role === 'donor' || role === 'admin') && requests) out.requests = requests.map((r) => serializeRequestRow(r, profiles));

  out.actions = availableActions(d, role, { canRequest, myRequestStatus: myRequest?.status, confirmedByMe, handoverStarted: Boolean(confirmations.donorAt || confirmations.recipientAt) });
  return out;
}

module.exports = { serializeDonation, serializeRequestRow, shortName };
