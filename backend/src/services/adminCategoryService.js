'use strict';
// Device categories (FR-ADM-005). Slugs never change once made, because they appear in links and filters; a rename only
// changes the display name. A category in use is deactivated, not deleted, so existing listings keep a meaning.
const { Types } = require('mongoose');
const Category = require('../models/Category');
const Device = require('../models/Device');
const DeviceListing = require('../models/DeviceListing');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const TechnicianProfile = require('../models/TechnicianProfile');
const RefurbisherProfile = require('../models/RefurbisherProfile');
const RecyclingCenter = require('../models/RecyclingCenter');
const RecyclingRecord = require('../models/RecyclingRecord');
const ApiError = require('../utils/ApiError');
const audit = require('./auditService');

const slugify = (name) => String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const present = (c, usage = {}) => ({
  _id: c._id, name: c.name, slug: c.slug, icon: c.icon, group: c.group || '', hazardous: Boolean(c.hazardous), active: c.active !== false, order: c.order || 0,
  usage: { listings: usage.listings || 0, products: usage.products || 0, references: usage.references || 0 },
  canDelete: !usage.references,
});

/** Aggregates are not soft-delete aware, which is what is wanted here: a deleted listing still blocks deleting its category. */
const groupBy = (Model, field, unwind) => Model.aggregate([...(unwind ? [{ $unwind: `$${field}` }] : []), { $match: { [field]: { $ne: null } } }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]);

async function usageByCategory() {
  const [listings, products, devices, tech, refurb, centres, records] = await Promise.all([
    groupBy(DeviceListing, 'category'), groupBy(MarketplaceProduct, 'category'), groupBy(Device, 'category'),
    groupBy(TechnicianProfile, 'deviceCategories', true), groupBy(RefurbisherProfile, 'categories', true),
    groupBy(RecyclingCenter, 'acceptedCategories', true), groupBy(RecyclingRecord, 'categories', true),
  ]);
  const usage = new Map();
  const add = (rows, field) => rows.forEach((r) => {
    const k = String(r._id);
    const u = usage.get(k) || { listings: 0, products: 0, references: 0 };
    if (field) u[field] += r.n;
    u.references += r.n;
    usage.set(k, u);
  });
  add(listings, 'listings'); add(products, 'products'); add(devices); add(tech); add(refurb); add(centres); add(records);
  return usage;
}

async function list() {
  const [cats, usage] = await Promise.all([Category.find({}).sort({ order: 1, name: 1 }).lean(), usageByCategory()]);
  return cats.map((c) => present(c, usage.get(String(c._id))));
}

const duplicate = () => ApiError.conflict('A category with this name already exists', 'DUPLICATE_CATEGORY');

async function create(admin, input, ip) {
  const slug = slugify(input.name);
  if (!slug) throw ApiError.validation([{ field: 'name', message: 'Use letters or numbers in the name' }]);
  if (await Category.exists({ $or: [{ slug }, { name: input.name }] })) throw duplicate();
  const last = await Category.findOne({}).sort({ order: -1 }).select('order').lean();
  let cat;
  try {
    cat = await Category.create({ name: input.name, slug, icon: input.icon || 'box', group: input.group || undefined, hazardous: Boolean(input.hazardous), active: input.active !== false, order: (last?.order ?? -1) + 1 });
  } catch (err) {
    if (err.code === 11000) throw duplicate();
    throw err;
  }
  await audit.record(admin, 'category.created', { targetType: 'Category', targetId: cat._id, after: present(cat), ip });
  return present(cat);
}

const EDITABLE = ['name', 'icon', 'group', 'hazardous', 'active'];

async function update(admin, id, input, ip) {
  const cat = await Category.findById(id);
  if (!cat) throw ApiError.notFound('Category not found');
  const before = present(cat);
  if (input.name !== undefined && input.name !== cat.name && await Category.exists({ name: input.name, _id: { $ne: cat._id } })) throw duplicate();
  EDITABLE.forEach((f) => { if (input[f] !== undefined) cat[f] = f === 'group' ? (input[f] || undefined) : input[f]; });
  if (!cat.isModified()) throw ApiError.conflict('Nothing was changed', 'NO_CHANGE');
  const activeChanged = cat.isModified('active');
  try {
    await cat.save();
  } catch (err) {
    if (err.code === 11000) throw duplicate();
    throw err;
  }
  const action = activeChanged ? (cat.active ? 'category.activated' : 'category.deactivated') : 'category.updated';
  await audit.record(admin, action, { targetType: 'Category', targetId: cat._id, before, after: present(cat), ip });
  return present(cat, (await usageByCategory()).get(String(cat._id)));
}

/** Sets the display order. The full list must be sent, so no category is left with an unclear position. */
async function reorder(admin, ids, ip) {
  const cats = await Category.find({}).select('_id').lean();
  const known = new Set(cats.map((c) => String(c._id)));
  if (ids.length !== known.size || !ids.every((i) => known.has(String(i)))) {
    throw ApiError.validation([{ field: 'ids', message: 'Send every category exactly once' }]);
  }
  await Category.bulkWrite(ids.map((i, n) => ({ updateOne: { filter: { _id: new Types.ObjectId(String(i)) }, update: { $set: { order: n } } } })));
  await audit.record(admin, 'category.reordered', { targetType: 'Category', after: { ids }, ip });
  return list();
}

async function remove(admin, id, ip) {
  const cat = await Category.findById(id).lean();
  if (!cat) throw ApiError.notFound('Category not found');
  const usage = (await usageByCategory()).get(String(cat._id));
  if (usage?.references) throw ApiError.conflict('This category is in use. Deactivate it instead so existing listings keep working.', 'CATEGORY_IN_USE');
  await Category.deleteOne({ _id: cat._id });
  await audit.record(admin, 'category.deleted', { targetType: 'Category', targetId: cat._id, before: present(cat), ip });
  return { _id: cat._id };
}

module.exports = { list, create, update, reorder, remove, slugify };
