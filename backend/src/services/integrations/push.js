'use strict';
// Push notifications through Firebase Cloud Messaging (P8-06, FR-NOTIF-002). With no FIREBASE_SERVICE_ACCOUNT_PATH (or one that
// cannot be read) push is simply off: the in-app notification is always saved and shown, and nothing here ever fails the
// request that caused a notification. A person who has switched push off in their settings is not sent one, and a token that
// Firebase says is dead is deleted so it is not tried again.
const fs = require('fs');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const DeviceToken = require('../../models/DeviceToken');
const UserProfile = require('../../models/UserProfile');

const CHUNK = 500; // Firebase accepts at most 500 tokens per multicast
const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

let messaging; // undefined: not looked at yet; null: off
const _setMessaging = (m) => { messaging = m; };

function getMessaging() {
  if (messaging !== undefined) return messaging;
  if (!env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    logger.info('Push is off: FIREBASE_SERVICE_ACCOUNT_PATH is not set. In-app notifications still work.');
    messaging = null;
    return messaging;
  }
  try {
    const admin = require('firebase-admin'); // loaded only when push is configured
    const credential = JSON.parse(fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
    messaging = admin.initializeApp({ credential: admin.credential.cert(credential) }, 'ewaste-push').messaging();
  } catch (err) {
    logger.warn({ reason: err?.code || err?.message || 'error' }, 'Push is off: the Firebase service account could not be used');
    messaging = null;
  }
  return messaging;
}

const isEnabled = () => Boolean(getMessaging());

/** Firebase data values must be strings. */
const stringify = (data = {}) => Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));

/**
 * Sends one notification to every device of the given people who have not switched push off. Resolves to
 * `{ sent, failed, removed }`, or `{ skipped }` when push is off. Never throws.
 */
async function sendToUsers(userIds, { title, body, data }) {
  try {
    const m = getMessaging();
    if (!m) return { skipped: 'off' };
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
    if (!ids.length) return { sent: 0, failed: 0, removed: 0 };
    const muted = await UserProfile.find({ user: { $in: ids }, 'preferences.pushNotifications': false }).select('user').lean();
    const mutedIds = new Set(muted.map((p) => String(p.user)));
    const wanted = ids.filter((id) => !mutedIds.has(id));
    if (!wanted.length) return { sent: 0, failed: 0, removed: 0 };
    const tokens = (await DeviceToken.find({ user: { $in: wanted } }).select('fcmToken').lean()).map((t) => t.fcmToken);
    let sent = 0; let failed = 0; const dead = [];
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const batch = tokens.slice(i, i + CHUNK);
      const res = await m.sendEachForMulticast({ tokens: batch, notification: { title, body }, data: stringify(data), android: { priority: 'high' } });
      res.responses.forEach((r, j) => {
        if (r.success) { sent += 1; return; }
        failed += 1;
        if (DEAD.has(r.error?.code)) dead.push(batch[j]);
      });
    }
    if (dead.length) await DeviceToken.deleteMany({ fcmToken: { $in: dead } });
    return { sent, failed, removed: dead.length };
  } catch (err) {
    logger.warn({ reason: err?.message || 'error' }, 'push could not be sent');
    return { skipped: 'error' };
  }
}

/** Remembers a device for a person. A token belongs to one person at a time: signing in as someone else on the same phone moves it. */
async function registerDevice(user, { token, platform = 'android' }) {
  const doc = await DeviceToken.findOneAndUpdate({ fcmToken: token }, { $set: { user: user.id, platform, lastSeenAt: new Date() } }, { upsert: true, new: true });
  return { _id: doc._id, platform: doc.platform };
}

/** Forgets one of the person's own devices (sign-out). Someone else's token is left alone and the answer is the same. */
async function unregisterDevice(user, token) {
  await DeviceToken.deleteOne({ fcmToken: token, user: user.id });
  return { removed: true };
}

module.exports = { sendToUsers, registerDevice, unregisterDevice, isEnabled, _setMessaging };