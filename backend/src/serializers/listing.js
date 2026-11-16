'use strict';
// Shapes DeviceListing for API output. Exact location, lock info and report counts are owner/admin-only (BR-08, NFR-SEC-13).
const idOf = (v) => String(v && v._id ? v._id : v);

function serializeListing(listing, viewer) {
  const out = { ...listing };
  const isOwner = viewer && idOf(listing.owner) === String(viewer.id);
  const isAdmin = viewer && viewer.role === 'admin';

  if (listing.owner && listing.owner._id) {
    out.owner = { _id: listing.owner._id, name: listing.owner.name, avatar: listing.owner.avatar };
  }
  if (!isOwner && !isAdmin) {
    delete out.location;
    delete out.lockedBy;
    delete out.reportCount;
  }
  // The owner is told why a listing was taken down; nobody else sees the moderation record.
  if (out.moderation && !isAdmin) {
    if (isOwner) out.moderation = { reason: out.moderation.reason, at: out.moderation.at };
    else delete out.moderation;
  }
  out.isOwner = Boolean(isOwner);
  return out;
}

module.exports = { serializeListing };
