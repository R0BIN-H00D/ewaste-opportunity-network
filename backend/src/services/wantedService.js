'use strict';
// Wanted-device requests: what a refurbisher is looking for. Owners can read the open ones.
const WantedRequest = require('../models/WantedRequest');
const WantedResponse = require('../models/WantedResponse');
const Category = require('../models/Category');
const { notify } = require('./notificationService');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildMeta } = require('../utils/pagination');

const POPULATE = [{ path: 'category', select: 'name slug icon' }, { path: 'refurbisher', select: 'name avatar' }];

async function create(user, input) {
  const { category: slug, ...rest } = input;
  let category;
  if (slug) {
    const cat = await Category.findOne({ slug }).select('_id').lean();
    if (!cat) throw ApiError.badRequest('Unknown category');
    category = cat._id;
  }
  const doc = await WantedRequest.create({ ...rest, ...(category ? { category } : {}), refurbisher: user.id });
  return WantedRequest.findById(doc._id).populate(POPULATE).lean();
}

/** `mine` (default for refurbishers) lists my own; `board` lists everyone's open requests. */
async function list(user, query) {
  const pg = parsePagination(query, { defaultLimit: 12 });
  if (query.as === 'accepted') {
    // The requests I have accepted (owners and technicians), newest first, open or closed.
    const filter = { responder: user.id };
    const [rows, total] = await Promise.all([
      WantedResponse.find(filter).populate({ path: 'request', populate: POPULATE }).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
      WantedResponse.countDocuments(filter),
    ]);
    const items = rows.filter((r) => r.request).map((r) => ({ ...r.request, hasResponded: true, acceptedAt: r.createdAt }));
    return { items, meta: buildMeta(pg, total) };
  }
  const board = query.as === 'board' || user.role !== 'refurbisher';
  const filter = board ? { status: 'open' } : { refurbisher: user.id, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    WantedRequest.find(filter).populate(POPULATE).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
    WantedRequest.countDocuments(filter),
  ]);
  const ids = items.map((w) => w._id);
  if (board) {
    // Tell each viewer which requests they have already accepted.
    const mine = await WantedResponse.find({ responder: user.id, request: { $in: ids } }).select('request').lean();
    const done = new Set(mine.map((m) => String(m.request)));
    items.forEach((w) => { w.hasResponded = done.has(String(w._id)); });
  } else {
    const counts = await WantedResponse.aggregate([{ $match: { request: { $in: ids } } }, { $group: { _id: '$request', n: { $sum: 1 } } }]);
    const by = new Map(counts.map((c) => [String(c._id), c.n]));
    items.forEach((w) => { w.responseCount = by.get(String(w._id)) || 0; });
  }
  return { items, meta: buildMeta(pg, total) };
}

/** One request, with whether the viewer has already accepted it (and their message), for the page where they accept it. */
async function getOne(id, user) {
  const doc = await WantedRequest.findById(id).populate(POPULATE).lean();
  if (!doc) throw ApiError.notFound('Request not found');
  const mine = await WantedResponse.findOne({ request: id, responder: user.id }).select('message createdAt').lean();
  return { ...doc, hasResponded: Boolean(mine), ...(mine ? { myResponse: { message: mine.message || '', at: mine.createdAt } } : {}), isMine: String(doc.refurbisher?._id) === user.id };
}

/** A device owner or technician says they can help with an open request. The refurbisher is told. */
async function respond(id, user, { message } = {}) {
  const request = await WantedRequest.findById(id).select('refurbisher title status').lean();
  if (!request || request.status !== 'open') throw ApiError.notFound('This request is no longer open');
  if (String(request.refurbisher) === user.id) throw ApiError.conflict('You cannot respond to your own request', 'OWN_REQUEST');
  let response;
  try {
    response = await WantedResponse.create({ request: id, responder: user.id, refurbisher: request.refurbisher, ...(message ? { message } : {}) });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('You have already accepted this request', 'ALREADY_RESPONDED');
    throw err;
  }
  await notify(request.refurbisher, {
    type: 'wanted.response',
    title: `${user.name} can help with your request`,
    body: request.title,
    data: { id: String(response._id), deepLink: '/dashboard/opportunities' },
  });
  return response.toJSON();
}

/** The people who accepted one of my requests. */
async function listResponses(id, user) {
  const request = await WantedRequest.findOne({ _id: id, refurbisher: user.id }).select('_id').lean();
  if (!request) throw ApiError.notFound('Request not found');
  return WantedResponse.find({ request: id }).populate({ path: 'responder', select: 'name avatar role' }).sort({ createdAt: -1 }).lean();
}

/** The refurbisher changes their own request. An empty optional field is cleared. */
async function update(id, user, input) {
  const { category: slug, ...rest } = input;
  const set = {};
  const unset = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    if (value === null || value === '') unset[key] = 1;
    else set[key] = value;
  }
  if (slug !== undefined) {
    if (!slug) unset.category = 1;
    else {
      const cat = await Category.findOne({ slug }).select('_id').lean();
      if (!cat) throw ApiError.badRequest('Unknown category');
      set.category = cat._id;
    }
  }
  if (unset.title) delete unset.title;
  const doc = await WantedRequest.findOneAndUpdate({ _id: id, refurbisher: user.id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true }).populate(POPULATE).lean();
  if (!doc) throw ApiError.notFound('Request not found');
  return doc;
}

async function setStatus(id, user, { status }) {
  const doc = await WantedRequest.findOneAndUpdate({ _id: id, refurbisher: user.id }, { $set: { status } }, { new: true }).populate(POPULATE).lean();
  if (!doc) throw ApiError.notFound('Request not found');
  return doc;
}

async function remove(id, user) {
  const res = await WantedRequest.deleteOne({ _id: id, refurbisher: user.id });
  if (!res.deletedCount) throw ApiError.notFound('Request not found');
}

module.exports = { create, list, getOne, update, setStatus, remove, respond, listResponses };
