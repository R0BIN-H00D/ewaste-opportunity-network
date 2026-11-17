'use strict';
const { isValidObjectId } = require('mongoose');
const Category = require('../models/Category');
const Device = require('../models/Device');
const DeviceListing = require('../models/DeviceListing');
const storage = require('./integrations/storage');
const ApiError = require('../utils/ApiError');
const { makePoint, withinRadius } = require('../utils/geo');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { serializeListing } = require('../serializers/listing');
const { MAX_DEVICE_PHOTOS } = require('../config/constants');

const POPULATE = [
  { path: 'device', select: 'name brand model purchaseYear ageYears photos specs' },
  { path: 'category', select: 'name slug icon hazardous' },
  { path: 'owner', select: 'name avatar' },
];

// Which status changes the owner may make (BR-03 also blocks any change while in_service).
const ALLOWED_TRANSITIONS = {
  draft: ['listed', 'withdrawn'],
  listed: ['draft', 'withdrawn'],
  withdrawn: ['listed', 'draft'],
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function resolveCategory(idOrSlug) {
  const query = isValidObjectId(idOrSlug) && /^[a-f\d]{24}$/i.test(idOrSlug) ? { _id: idOrSlug } : { slug: String(idOrSlug).toLowerCase() };
  const cat = await Category.findOne({ ...query, active: true });
  if (!cat) throw ApiError.validation([{ field: 'category', message: 'Unknown category' }]);
  return cat;
}

async function fetchForViewer(id, viewer) {
  const doc = await DeviceListing.findById(id).populate(POPULATE).lean();
  return doc ? serializeListing(doc, viewer) : null;
}

async function createListing(user, input, files = []) {
  const status = input.status || 'listed';
  if (status === 'listed' && files.length === 0) {
    throw ApiError.validation([{ field: 'photos', message: 'At least one photo is required to publish a listing (or save it as a draft)' }]);
  }
  const category = await resolveCategory(input.category);
  const stored = await storage.saveMany(files, { folder: `devices/${user.id}` });

  try {
    const device = await Device.create({
      owner: user.id,
      name: input.name,
      category: category._id,
      brand: input.brand,
      model: input.model,
      purchaseYear: input.purchaseYear,
      photos: stored.map(storage.toPhoto),
      ...(input.aiSuggestion ? { aiSuggestion: { ...input.aiSuggestion, confirmedByUser: true } } : {}),
    });
    const listing = await DeviceListing.create({
      device: device._id,
      owner: user.id,
      category: category._id,
      title: input.name,
      brand: input.brand,
      model: input.model,
      condition: input.condition,
      description: input.description,
      preferredService: input.preferredService,
      expectedPrice: input.expectedPrice,
      pickupPreference: input.pickupPreference,
      addressArea: input.addressArea,
      city: input.city,
      location: input.lat !== undefined ? makePoint(input.lng, input.lat) : undefined,
      status,
    });
    return fetchForViewer(listing._id, user);
  } catch (err) {
    await Promise.all(stored.map((s) => storage.remove(s.publicId)));
    throw err;
  }
}

async function listListings(query, viewer) {
  const filter = {};
  const isAdmin = viewer?.role === 'admin';

  if (query.mine === 'true') {
    if (!viewer) throw ApiError.unauthorized();
    filter.owner = viewer.id;
    if (query.status) filter.status = query.status;
  } else if (isAdmin && query.status) {
    filter.status = query.status; // admin moderation view
  } else {
    filter.status = 'listed'; // public browse shows only live listings
  }

  if (query.category) filter.category = (await resolveCategory(query.category))._id;
  if (query.condition) filter.condition = query.condition;
  if (query.service) filter.preferredService = query.service;
  if (query.city) filter.city = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.expectedPrice = {};
    if (query.minPrice !== undefined) filter.expectedPrice.$gte = query.minPrice;
    if (query.maxPrice !== undefined) filter.expectedPrice.$lte = query.maxPrice;
  }
  if (query.lat !== undefined) filter.location = withinRadius(query.lng, query.lat, query.radiusKm || 25);
  if (query.q) filter.$text = { $search: query.q };

  const sorts = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, price_asc: { expectedPrice: 1, createdAt: -1 }, price_desc: { expectedPrice: -1, createdAt: -1 } };
  const useScore = query.q && (query.sort === 'relevance' || !query.sort);
  const sort = useScore ? { score: { $meta: 'textScore' }, createdAt: -1 } : sorts[query.sort] || sorts.newest;

  const pg = parsePagination(query, { defaultLimit: 12 });
  const find = DeviceListing.find(filter, useScore ? { score: { $meta: 'textScore' } } : undefined);
  const [items, total] = await Promise.all([
    find.sort(sort).skip(pg.skip).limit(pg.limit).populate(POPULATE).lean(),
    DeviceListing.countDocuments(filter),
  ]);

  return { items: items.map((l) => serializeListing(l, viewer)), meta: buildMeta(pg, total) };
}

async function getListing(id, viewer) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Listing not found');
  const doc = await fetchForViewer(id, viewer);
  if (!doc) throw ApiError.notFound('Listing not found');
  const canSeeNonLive = doc.isOwner || viewer?.role === 'admin';
  if (doc.status !== 'listed' && !canSeeNonLive) throw ApiError.notFound('Listing not found');
  if (!doc.isOwner) DeviceListing.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).catch(() => {});
  return doc;
}

/** Loads listing + device and enforces ownership (owner or admin) and the lock rule (BR-03). */
async function loadMutable(id, user) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Listing not found');
  const listing = await DeviceListing.findById(id);
  if (!listing) throw ApiError.notFound('Listing not found');
  if (String(listing.owner) !== String(user.id) && user.role !== 'admin') throw ApiError.forbidden('You can only change your own listings');
  if (listing.status === 'in_service' || listing.lockedBy?.refId) {
    throw ApiError.conflict('This listing is part of an active service and cannot be changed', 'LISTING_LOCKED');
  }
  if (['completed', 'removed_by_admin'].includes(listing.status)) {
    throw ApiError.conflict(`A ${listing.status.replace(/_/g, ' ')} listing cannot be changed`, 'LISTING_FINAL');
  }
  const device = await Device.findById(listing.device);
  if (!device) throw ApiError.notFound('Listing device not found');
  return { listing, device };
}

async function updateListing(id, user, input, files = []) {
  const { listing, device } = await loadMutable(id, user);

  const removeIds = input.removePhotoIds || [];
  const remaining = device.photos.filter((p) => !removeIds.includes(p.publicId));
  if (remaining.length + files.length > MAX_DEVICE_PHOTOS) {
    throw ApiError.validation([{ field: 'photos', message: `A device can have at most ${MAX_DEVICE_PHOTOS} photos` }]);
  }

  let nextStatus = listing.status;
  if (input.status && input.status !== listing.status) {
    if (!(ALLOWED_TRANSITIONS[listing.status] || []).includes(input.status)) {
      throw ApiError.conflict(`Cannot change status from ${listing.status} to ${input.status}`, 'INVALID_TRANSITION');
    }
    nextStatus = input.status;
  }
  if (nextStatus === 'listed' && remaining.length + files.length === 0) {
    throw ApiError.validation([{ field: 'photos', message: 'At least one photo is required for a published listing' }]);
  }

  if (input.category) {
    const cat = await resolveCategory(input.category);
    device.category = cat._id;
    listing.category = cat._id;
  }
  for (const f of ['name', 'brand', 'model', 'purchaseYear']) if (input[f] !== undefined) device[f] = input[f];
  if (input.name !== undefined) listing.title = input.name;
  if (input.brand !== undefined) listing.brand = input.brand;
  if (input.model !== undefined) listing.model = input.model;
  for (const f of ['condition', 'description', 'preferredService', 'expectedPrice', 'pickupPreference', 'addressArea', 'city']) {
    if (input[f] !== undefined) listing[f] = input[f];
  }
  if (input.lat !== undefined) listing.location = makePoint(input.lng, input.lat);
  listing.status = nextStatus;

  const added = await storage.saveMany(files, { folder: `devices/${listing.owner}` });
  device.photos = [...remaining, ...added.map(storage.toPhoto)];
  try {
    await device.save();
    await listing.save();
  } catch (err) {
    await Promise.all(added.map((s) => storage.remove(s.publicId)));
    throw err;
  }
  await Promise.all(removeIds.map((pid) => storage.remove(pid))); // best effort, after a successful save
  return fetchForViewer(listing._id, user);
}

async function removeListing(id, user) {
  const { listing, device } = await loadMutable(id, user);
  await listing.softDelete();
  await device.softDelete();
}

module.exports = { createListing, listListings, getListing, updateListing, removeListing, resolveCategory };
