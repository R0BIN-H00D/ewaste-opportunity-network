'use strict';
// Pickup reminders (FR-PICK, P9-08): a message the day before and about two hours before a confirmed pickup, to both people.
// Each reminder is CLAIMED on the pickup with one atomic update before anything is sent, so two servers (or two overlapping
// runs) can never send the same reminder twice. A time that was set or changed with too little notice for a reminder to be
// useful is not reminded about, and a changed time starts the reminders again.
const PickupSchedule = require('../models/PickupSchedule');
const { notify } = require('./notificationService');
const logger = require('../utils/logger');

const HOUR = 3600 * 1000;
const KINDS = {
  service: { label: 'Repair pickup', link: (id) => `/dashboard/requests/${id}` },
  donation: { label: 'Donation handover', link: (id) => `/dashboard/donations/${id}` },
  offer: { label: 'Refurbishment handover', link: (id) => `/dashboard/refurbishment/${id}` },
  recycling: { label: 'Recycling pickup', link: (id) => `/dashboard/recycling/${id}` },
};

// field -> how far ahead it is sent (the window is the span from "too soon" to "right on time") and the least notice that makes it worth sending
const REMINDERS = {
  day: { from: 2 * HOUR, to: 24 * HOUR, minLead: 26 * HOUR, title: 'Pickup tomorrow' },
  hour: { from: 0, to: 2 * HOUR, minLead: 3 * HOUR, title: 'Pickup in about two hours' },
};

const when = (p) => `${p.date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}${p.timeSlot ? ` (${p.timeSlot})` : ''}`;
const idOf = (v) => String(v && v._id ? v._id : v);

/** Sends every reminder that is due at `now`. Resolves to how many were sent of each kind. Never throws for one bad pickup. */
async function sendDue(now = new Date()) {
  const sent = { day: 0, hour: 0 };
  for (const [field, r] of Object.entries(REMINDERS)) {
    const due = await PickupSchedule.find({
      status: 'confirmed',
      [`reminders.${field}`]: null,
      date: { $gt: new Date(now.getTime() + r.from), $lte: new Date(now.getTime() + r.to) },
    });
    for (const p of due) {
      try {
        const lead = p.date.getTime() - (p.timeSetAt || p.createdAt || now).getTime();
        const claimFilter = { _id: p._id, status: 'confirmed', [`reminders.${field}`]: null };
        // Too little notice to be useful: mark it so it is not looked at again, but send nothing.
        const claimed = await PickupSchedule.findOneAndUpdate(claimFilter, { $set: { [`reminders.${field}`]: now } }, { new: true });
        if (!claimed || lead < r.minLead) continue;
        const spec = KINDS[p.contextType];
        await notify([idOf(p.requester), idOf(p.provider)], {
          type: 'pickup.reminder',
          title: r.title,
          body: `${spec?.label || 'Pickup'}: ${when(p)}`,
          data: { id: String(p.contextId), pickupId: String(p._id), deepLink: spec ? spec.link(idOf(p.contextId)) : '/dashboard/pickups' },
        });
        sent[field] += 1;
      } catch (err) {
        logger.warn({ err: err.message }, 'a pickup reminder could not be sent');
      }
    }
  }
  return sent;
}

module.exports = { sendDue, REMINDERS };