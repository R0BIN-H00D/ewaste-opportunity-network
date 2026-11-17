'use strict';
// The change feed: when a record changes, everyone who can see it is told, so the website and the app show the same thing
// without anyone reloading. It is one plugin on every schema, so no service has to remember to announce its own changes.
//
// What is sent is only { resource, id, action }, never the record. A client that hears it fetches the record again through the
// normal API, which applies the usual permission checks. Who hears it:
//   - the people named on the record (every field that refers to a User), in their private rooms;
//   - administrators, for everything;
//   - everyone, for the few kinds of record that are public while in a public state (a listed device, a published article...).
// Nothing is sent when the live server is not attached (tests, scripts), and a failure here never fails the write.
const { hasIo, emitToRooms, emitToAll } = require('./emitter');
const logger = require('../utils/logger');

const EVENT = 'data:changed';

// Model -> the name clients use. A model that is not listed is not announced (tokens, logs, counters, chat, which has its own events).
const RESOURCE = {
  Device: 'listing', DeviceListing: 'listing',
  ServiceRequest: 'request', Quotation: 'request',
  Donation: 'donation', DonationRequest: 'donation',
  RefurbishmentJob: 'refurbishment',
  MarketplaceProduct: 'product', Order: 'order',
  RecyclingRecord: 'recycling', RecyclingCenter: 'recycling-center',
  PickupSchedule: 'pickup',
  Review: 'review', Complaint: 'complaint', Report: 'report',
  LearningOpportunity: 'learning', StudentApplication: 'learning', Certificate: 'learning',
  EducationArticle: 'education', Announcement: 'announcement', Category: 'category',
  User: 'profile', UserProfile: 'profile', TechnicianProfile: 'profile', StudentProfile: 'profile', RefurbisherProfile: 'profile', VerificationDocument: 'verification',
  GreenScoreLedger: 'impact', EnvironmentalImpact: 'impact',
  Transaction: 'payment',
};

// Records that everyone may see while they are in one of these states. `'*'` means always.
const PUBLIC_WHEN = {
  DeviceListing: ['listed'],
  MarketplaceProduct: ['active'],
  Donation: ['open', 'requested'],
  LearningOpportunity: ['open'],
  EducationArticle: ['published'],
  Announcement: '*',
  Category: '*',
  RecyclingCenter: '*',
};

// What was true of a document just before it was saved (new? status changed?), for the hook that runs after. A WeakMap,
// because Mongoose clears `doc.$locals` between the two hooks.
const SAVING = new WeakMap();

const idOf = (v) => String(v && v._id ? v._id : v);

/** Every path on the schema that points at a User, including arrays of them. */
function userPaths(schema) {
  const out = [];
  schema.eachPath((path, type) => {
    const ref = type.options?.ref || type.caster?.options?.ref;
    if (ref === 'User') out.push(path);
  });
  return out;
}

function usersOf(doc, paths) {
  const ids = new Set();
  for (const p of paths) {
    const v = typeof doc.get === 'function' ? doc.get(p) : p.split('.').reduce((o, k) => o?.[k], doc);
    (Array.isArray(v) ? v : [v]).forEach((x) => { if (x) ids.add(idOf(x)); });
  }
  return [...ids];
}

function announce(modelName, doc, action, { statusChanged = false, paths }) {
  try {
    const resource = RESOURCE[modelName];
    if (!resource || !doc) return;
    const id = idOf(doc._id);
    const payload = { resource, id, action };
    const rooms = ['role:admin', ...usersOf(doc, paths).map((u) => `user:${u}`)];
    emitToRooms(rooms, EVENT, payload);
    const rule = PUBLIC_WHEN[modelName];
    const status = typeof doc.get === 'function' ? doc.get('status') : doc.status;
    // A record that has just LEFT its public state is announced too, so open lists drop it.
    if (rule && (rule === '*' || rule.includes(status) || statusChanged)) emitToAll(EVENT, payload);
  } catch (err) {
    logger.warn({ err: err.message }, 'change feed failed');
  }
}

/** The plugin. Mongoose runs `post` hooks after the write has succeeded, so nothing is announced for a failed one. */
function changeFeed(schema) {
  const paths = userPaths(schema);

  schema.pre('save', function rememberState(next) {
    // A brand-new record has "changed" every field, so only an existing one counts as having left a state.
    SAVING.set(this, { wasNew: this.isNew, statusChanged: !this.isNew && this.isModified('status') });
    next();
  });
  schema.post('save', function afterSave(doc) {
    if (!hasIo()) return;
    const feed = SAVING.get(doc) || {};
    announce(doc.constructor.modelName, doc, feed.wasNew ? 'created' : 'updated', { statusChanged: Boolean(feed.statusChanged), paths });
  });

  // Updates made straight on the collection give back no document, so look the record up again (only while the live server is on).
  const viaQuery = (action) => async function afterQuery(res) {
    if (!hasIo()) return;
    try {
      const filter = this.getFilter();
      const update = typeof this.getUpdate === 'function' ? this.getUpdate() : null;
      const statusChanged = Boolean(update && (update.status !== undefined || update.$set?.status !== undefined));
      let doc = this._feedDoc || (res && res._id ? res : null);
      if (!doc && action !== 'deleted' && filter && filter._id) doc = await this.model.findOne({ _id: filter._id }).setOptions({ withDeleted: true }).lean();
      if (doc) announce(this.model.modelName, doc, action, { statusChanged, paths });
    } catch (err) {
      logger.warn({ err: err.message }, 'change feed failed');
    }
  };
  schema.post('findOneAndUpdate', viaQuery('updated'));
  // A deleted record is gone by the time the hook runs, so read it first.
  schema.pre('deleteOne', { document: false, query: true }, async function rememberDeleted() {
    if (hasIo()) this._feedDoc = await this.model.findOne(this.getFilter()).setOptions({ withDeleted: true }).lean();
  });
  schema.post('updateOne', viaQuery('updated'));
  schema.post('deleteOne', { document: false, query: true }, viaQuery('deleted'));
}

module.exports = { changeFeed, EVENT, RESOURCE, PUBLIC_WHEN, userPaths };