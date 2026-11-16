'use strict';
// Refurbished marketplace (FR-MKT-004..008). Only products of admin-approved refurbishers are public (BR-01), each one
// carries its disclosed condition and the "Refurbished" label (BR-11), and sellers appear by business name and city only.
const { isValidObjectId } = require('mongoose');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const RefurbisherProfile = require('../models/RefurbisherProfile');
const RefurbishmentJob = require('../models/RefurbishmentJob');
const DeviceListing = require('../models/DeviceListing');
const Category = require('../models/Category');
const Order = require('../models/Order');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const storage = require('./integrations/storage');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { notify } = require('./notificationService');
const { serializeProduct } = require('../serializers/marketplace');
const refurbWorkflow = require('./workflow/refurbishment');
const orderWorkflow = require('./workflow/order');
const { resolveCategory } = require('./deviceService');
const { MAX_PRODUCT_PHOTOS } = require('../validators/marketplace.validators');

const idOf = (v) => String(v && v._id ? v._id : v);
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const POPULATE = [{ path: 'seller', select: 'name' }, { path: 'category', select: 'name slug icon' }];
const SORT = {
  newest: { createdAt: -1 },
  price_asc: { price: 1, createdAt: -1 },
  price_desc: { price: -1, createdAt: -1 },
  rating: { ratingAvg: -1, ratingCount: -1, createdAt: -1 },
};

const verifiedSellerIds = () => RefurbisherProfile.distinct('user', { 'verification.status': 'approved' });

async function profilesFor(sellerIds) {
  const rows = await RefurbisherProfile.find({ user: { $in: sellerIds } }).select('user businessName city ratingAvg ratingCount verification.status').lean();
  return new Map(rows.map((r) => [String(r.user), r]));
}

async function viewMany(rows, user, opts = {}) {
  const profiles = await profilesFor([...new Set(rows.map((r) => idOf(r.seller)))]);
  return rows.map((p) => serializeProduct(p, { profile: profiles.get(idOf(p.seller)), viewerId: user?.id, role: user?.role, ...opts }));
}

/* ---------- reading ---------- */

/** Public browse: active products with stock, from approved refurbishers. Sold-out items drop out automatically (FR-MKT-010). */
async function listProducts(user, query) {
  const pg = parsePagination(query, { defaultLimit: 12 });
  let sellers = await verifiedSellerIds();
  if (query.seller) sellers = sellers.filter((s) => String(s) === query.seller);
  const filter = { status: 'active', stock: { $gt: 0 }, seller: { $in: sellers } };
  if (query.condition) filter.condition = query.condition;
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {
      ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
    };
  }
  if (query.q) filter.$or = ['title', 'brand', 'model'].map((f) => ({ [f]: new RegExp(escapeRegex(query.q), 'i') }));
  if (query.category) {
    const cat = await Category.findOne(isValidObjectId(query.category) && /^[a-f\d]{24}$/i.test(query.category) ? { _id: query.category } : { slug: query.category.toLowerCase() }).select('_id').lean();
    filter.category = cat ? cat._id : null;
  }
  const [rows, total] = await Promise.all([
    MarketplaceProduct.find(filter).populate(POPULATE).sort(SORT[query.sort || 'newest']).skip(pg.skip).limit(pg.limit).lean(),
    MarketplaceProduct.countDocuments(filter),
  ]);
  return { items: await viewMany(rows, user), meta: buildMeta(pg, total) };
}

/** The seller's own products in any state (except removed). */
async function listMine(user, query) {
  const pg = parsePagination(query, { defaultLimit: 12 });
  const filter = { seller: user.id, status: query.status || { $ne: 'removed' } };
  const [rows, total] = await Promise.all([
    MarketplaceProduct.find(filter).populate(POPULATE).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
    MarketplaceProduct.countDocuments(filter),
  ]);
  return { items: await viewMany(rows, user), meta: buildMeta(pg, total) };
}

async function loadProduct(id) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Product not found');
  const p = await MarketplaceProduct.findById(id).populate(POPULATE);
  if (!p || p.status === 'removed') throw ApiError.notFound('Product not found');
  return p;
}

const isSeller = (p, user) => Boolean(user) && idOf(p.seller) === user.id;

/** Product page. Hidden items and items of unverified sellers are visible only to the seller and admin. */
async function getProduct(id, user) {
  const p = await loadProduct(id);
  const profile = (await profilesFor([idOf(p.seller)])).get(idOf(p.seller));
  const privileged = isSeller(p, user) || user?.role === 'admin';
  if (!privileged && (p.status === 'hidden' || profile?.verification?.status !== 'approved')) throw ApiError.notFound('Product not found');
  return serializeProduct(p.toObject(), { profile, viewerId: user?.id, role: user?.role, detail: true });
}

/* ---------- writing ---------- */

async function loadMutable(id, user) {
  const p = await loadProduct(id);
  if (!isSeller(p, user) && user.role !== 'admin') throw ApiError.notFound('Product not found'); // do not reveal other sellers' items
  return p;
}

const fetchView = async (id, user) => getProduct(id, user);

/** Photos of a job are shared with the product made from it, so removing one must not delete the job's file. */
async function sharedPublicIds(product) {
  if (!product.refurbishmentJob) return new Set();
  const job = await RefurbishmentJob.findById(product.refurbishmentJob).select('beforePhotos afterPhotos').lean();
  return new Set([...(job?.beforePhotos || []), ...(job?.afterPhotos || [])].map((p) => p.publicId));
}

async function createProduct(user, input, files = []) {
  const category = await resolveCategory(input.category);

  let job = null;
  if (input.jobId) {
    job = await RefurbishmentJob.findById(input.jobId).lean();
    if (!job || String(job.refurbisher) !== user.id) throw ApiError.notFound('Job not found');
    if (job.status !== 'ready_to_list' || job.product) throw ApiError.conflict('Only a job that is ready to list can be listed', 'JOB_NOT_READY');
    if (input.stock !== undefined && input.stock !== 1) throw ApiError.validation([{ field: 'stock', message: 'A product made from one device has a stock of 1' }]);
  }
  const shared = !files.length && job ? job.afterPhotos || [] : [];
  if (files.length + shared.length === 0) throw ApiError.validation([{ field: 'photos', message: 'Add at least one photo of the product' }]);
  if (files.length + shared.length > MAX_PRODUCT_PHOTOS) throw ApiError.validation([{ field: 'photos', message: `A product can have at most ${MAX_PRODUCT_PHOTOS} photos` }]);

  if (job) {
    refurbWorkflow.assertTransition('ready_to_list', 'listed', refurbWorkflow.ACTORS.SYSTEM);
    // Claim the job first so two requests cannot list the same device twice.
    const claimed = await RefurbishmentJob.findOneAndUpdate(
      { _id: job._id, status: 'ready_to_list', product: { $exists: false } },
      { $set: { status: 'listed' }, $push: { history: { status: 'listed', at: new Date(), by: user.id, note: 'Listed on the marketplace' } } },
    );
    if (!claimed) throw ApiError.conflict('This job was just changed. Reload the page and try again.', 'STALE_STATE');
  }

  const stored = await storage.saveMany(files, { folder: `products/${user.id}` });
  let product;
  try {
    product = await MarketplaceProduct.create({
      seller: user.id,
      refurbishmentJob: job?._id,
      title: input.title,
      category: category._id,
      brand: input.brand,
      model: input.model,
      specs: input.specs || {},
      condition: input.condition,
      refurbishmentInfo: input.refurbishmentInfo,
      price: input.price,
      stock: job ? 1 : input.stock ?? 1,
      photos: [...shared, ...stored.map(storage.toPhoto)],
    });
  } catch (err) {
    await Promise.all(stored.map((s) => storage.remove(s.publicId)));
    if (job) await RefurbishmentJob.updateOne({ _id: job._id }, { $set: { status: 'ready_to_list' }, $pop: { history: 1 } });
    throw err;
  }

  if (job) {
    await Promise.all([
      RefurbishmentJob.updateOne({ _id: job._id }, { $set: { product: product._id } }),
      // The device has left its owner's hands for good; the listing is finished.
      DeviceListing.updateOne({ _id: job.listing }, { $set: { status: 'completed' }, $unset: { lockedBy: '' } }),
    ]);
    await notify(job.owner, { type: 'refurbishment.listed', title: 'Your device is on sale again', body: input.title, data: { id: job._id, deepLink: `/dashboard/refurbishment/${job._id}` } })
      .catch((err) => logger.error({ err: err.message }, 'listed notification failed'));
  }
  return fetchView(product._id, user);
}

async function updateProduct(id, user, input, files = []) {
  const product = await loadMutable(id, user);

  const removeIds = input.removePhotoIds || [];
  const remaining = product.photos.filter((p) => !removeIds.includes(p.publicId));
  if (remaining.length + files.length > MAX_PRODUCT_PHOTOS) throw ApiError.validation([{ field: 'photos', message: `A product can have at most ${MAX_PRODUCT_PHOTOS} photos` }]);
  if (remaining.length + files.length === 0) throw ApiError.validation([{ field: 'photos', message: 'A product needs at least one photo' }]);

  if (input.category) product.category = (await resolveCategory(input.category))._id;
  for (const f of ['title', 'brand', 'model', 'specs', 'condition', 'refurbishmentInfo', 'price', 'stock']) {
    if (input[f] !== undefined) product[f] = input[f];
  }
  // Stock and status stay consistent: nothing in stock means sold, and restocking a sold item puts it back on sale.
  if (product.stock === 0) product.status = 'sold';
  else if (product.status === 'sold') product.status = 'active';
  if (input.status) {
    if (input.status === 'active' && product.stock === 0) throw ApiError.conflict('Add stock before putting this product on sale', 'OUT_OF_STOCK');
    product.status = input.status;
  }

  const added = await storage.saveMany(files, { folder: `products/${idOf(product.seller)}` });
  product.photos = [...remaining, ...added.map(storage.toPhoto)];
  try {
    await product.save();
  } catch (err) {
    await Promise.all(added.map((s) => storage.remove(s.publicId)));
    throw err;
  }
  if (removeIds.length) {
    const keep = await sharedPublicIds(product);
    await Promise.all(removeIds.filter((pid) => !keep.has(pid)).map((pid) => storage.remove(pid).catch(() => {})));
  }
  return fetchView(product._id, user);
}

async function removeProduct(id, user) {
  const product = await loadMutable(id, user);
  const open = await Order.exists({ product: product._id, status: { $in: orderWorkflow.OPEN } });
  if (open) throw ApiError.conflict('Finish or cancel the open orders for this product first', 'HAS_OPEN_ORDERS');
  product.status = 'removed';
  await product.save();
  await product.softDelete();
  return { _id: product._id, removed: true };
}

/* ---------- buyer enquiries (FR-MKT-008) ---------- */

/** Opens (or continues) an enquiry conversation with the seller and notifies them. Real-time chat arrives in Phase 8. */
async function enquire(user, id, { message }) {
  const product = await loadProduct(id);
  const sellerId = idOf(product.seller);
  if (sellerId === user.id) throw ApiError.conflict('This is your own product', 'OWN_PRODUCT');
  const profile = (await profilesFor([sellerId])).get(sellerId);
  if (product.status !== 'active' || profile?.verification?.status !== 'approved') throw ApiError.conflict('This product is not available', 'PRODUCT_UNAVAILABLE');

  const key = [user.id, sellerId].sort().join(':');
  const conversation = await Conversation.findOneAndUpdate(
    { contextType: 'enquiry', contextId: product._id, participantsKey: key },
    {
      $setOnInsert: { participants: [user.id, sellerId] },
      $set: { lastMessage: { text: message, at: new Date(), sender: user.id } },
      $inc: { [`unread.${sellerId}`]: 1 },
    },
    { upsert: true, new: true },
  );
  await Message.create({ conversation: conversation._id, sender: user.id, text: message, readBy: [{ user: user.id }] });
  await notify(sellerId, {
    type: 'marketplace.enquiry',
    title: `Question about ${product.title}`,
    body: message.slice(0, 140),
    data: { id: product._id, deepLink: '/dashboard/products' },
  });
  return { sent: true, conversationId: conversation._id };
}

module.exports = { listProducts, listMine, getProduct, createProduct, updateProduct, removeProduct, enquire };
