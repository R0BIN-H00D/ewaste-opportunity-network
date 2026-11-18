'use strict';
// Who may talk to whom. A conversation always hangs off something the two people share (a repair, an order, a
// donation, a recycling request, a refurbishment offer) or off a listing someone is asking about. The server works out
// the two people from that record; the client never names the other participant, so nobody can message a stranger.
const ServiceRequest = require('../models/ServiceRequest');
const Order = require('../models/Order');
const RecyclingRecord = require('../models/RecyclingRecord');
const RecyclingCenter = require('../models/RecyclingCenter');
const Donation = require('../models/Donation');
const DonationRequest = require('../models/DonationRequest');
const RefurbishmentJob = require('../models/RefurbishmentJob');
const DeviceListing = require('../models/DeviceListing');
const WantedResponse = require('../models/WantedResponse');
const WantedRequest = require('../models/WantedRequest');

const CONTEXT_TYPES = ['service', 'order', 'recycling', 'donation', 'offer', 'enquiry', 'wanted'];

/** Each resolver returns the two people involved as [idA, idB], or null when the record does not exist or has no second person yet. */
const RESOLVERS = {
  // A repair talks to its assigned technician; before one is chosen there is nobody to talk to.
  service: async (id) => {
    const r = await ServiceRequest.findById(id).select('customer technician').lean();
    return r && r.technician ? [r.customer, r.technician] : null;
  },
  order: async (id) => {
    const o = await Order.findById(id).select('buyer seller').lean();
    return o ? [o.buyer, o.seller] : null;
  },
  recycling: async (id) => {
    const r = await RecyclingRecord.findById(id).select('requester center').lean();
    if (!r) return null;
    const centre = await RecyclingCenter.findById(r.center).select('user').lean();
    return centre ? [r.requester, centre.user] : null;
  },
  // For a donation the thread is one recipient's request: the donor and that recipient.
  donation: async (id) => {
    const req = await DonationRequest.findById(id).select('donation requester').lean();
    if (!req) return null;
    const donation = await Donation.findById(req.donation).select('donor').lean();
    return donation ? [donation.donor, req.requester] : null;
  },
  offer: async (id) => {
    const j = await RefurbishmentJob.findById(id).select('owner refurbisher').lean();
    return j ? [j.owner, j.refurbisher] : null;
  },
  // Someone who accepted a refurbisher's wanted-device request, and that refurbisher.
  wanted: async (id) => {
    const r = await WantedResponse.findById(id).select('request responder').lean();
    if (!r) return null;
    const req = await WantedRequest.findById(r.request).select('refurbisher').lean();
    return req ? [req.refurbisher, r.responder] : null;
  },
  // A question about a listing: the asker and the owner. The asker is whoever opens it, so it needs the caller.
  enquiry: async (id, callerId) => {
    const l = await DeviceListing.findById(id).select('owner status').lean();
    if (!l || l.status !== 'listed') return null;
    return [callerId, l.owner];
  },
};

/**
 * The two people for a context, if `callerId` is one of them. Returns null for an unknown record AND for a caller who is
 * not a party, so the two look the same from outside (no probing for ids that exist).
 */
async function partiesFor(contextType, contextId, callerId) {
  const resolve = RESOLVERS[contextType];
  if (!resolve) return null;
  const pair = await resolve(contextId, callerId);
  if (!pair) return null;
  const ids = pair.map(String);
  if (ids[0] === ids[1]) return null; // a conversation needs two different people
  return ids.includes(String(callerId)) ? ids : null;
}

module.exports = { CONTEXT_TYPES, partiesFor };
