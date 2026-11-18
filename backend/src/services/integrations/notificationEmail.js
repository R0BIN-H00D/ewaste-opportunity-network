'use strict';
// Email for the notifications that matter (P8-09): the ones that ask for something or report something that was decided. Chatty
// ones (progress updates, status changes) stay in the app only. Someone who has switched email off, or whose address has not
// been confirmed, is not emailed. The message carries the same words as the in-app notification and one button that opens the
// page in question; it is sent after the notification is saved and never delays or fails the request that caused it.
const env = require('../../config/env');
const logger = require('../../utils/logger');
const User = require('../../models/User');
const UserProfile = require('../../models/UserProfile');
const mailer = require('./mailer');
const { renderEmail } = require('./emailTemplates');

const EMAIL_TYPES = new Set([
  'quotation.new', 'quotation.accepted', 'quotation.rejected',
  'request.accepted', 'request.rejected', 'request.completed', 'request.cancelled',
  'donation.request', 'donation.accepted', 'donation.rejected', 'donation.handover', 'donation.completed', 'donation.cancelled',
  'refurbishment.offer', 'refurbishment.accepted', 'refurbishment.rejected', 'refurbishment.handover', 'refurbishment.cancelled',
  'recycling.pickup', 'recycling.collected', 'recycling.handover', 'recycling.cancelled',
  'order.placed', 'order.cancelled',
  'pickup.scheduled', 'pickup.confirmed', 'pickup.reminder',
  'account.suspended', 'account.reactivated', 'listing.removed', 'product.removed', 'review.hidden', 'complaint.involved',
]);

const isEmailed = (type) => EMAIL_TYPES.has(type);

/** Emails each person who should get it. Resolves to how many were sent; never throws. */
async function sendForNotification(userIds, { type, title, body, data = {} }) {
  try {
    if (!isEmailed(type)) return 0;
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
    if (!ids.length) return 0;
    const [users, muted] = await Promise.all([
      User.find({ _id: { $in: ids }, emailVerified: true, status: { $in: ['active', 'pending_verification', 'suspended'] } }).select('email name').lean(),
      UserProfile.find({ user: { $in: ids }, 'preferences.emailNotifications': false }).select('user').lean(),
    ]);
    const mutedIds = new Set(muted.map((p) => String(p.user)));
    const link = typeof data.deepLink === 'string' && data.deepLink.startsWith('/') && !data.deepLink.startsWith('//') ? `${env.CLIENT_WEB_URL}${data.deepLink}` : null;
    let sent = 0;
    for (const user of users.filter((x) => !mutedIds.has(String(x._id)))) {
      const mail = renderEmail({
        title,
        greeting: `Hi ${user.name},`,
        paragraphs: [body].filter(Boolean),
        button: link ? { label: 'Open it', url: link } : undefined,
        footer: 'You get this email because you have an account on the E-Waste Network. You can turn email notifications off in your settings.',
      });
      const res = await mailer.sendMail({ to: user.email, subject: `${title} - E-Waste Network`, ...mail });
      if (res.delivered !== 'failed') sent += 1;
    }
    return sent;
  } catch (err) {
    logger.warn({ reason: err?.message || 'error' }, 'notification email could not be sent');
    return 0;
  }
}

module.exports = { sendForNotification, isEmailed, EMAIL_TYPES };