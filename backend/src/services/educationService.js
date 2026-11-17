'use strict';
// Learning-centre articles (FR-EDU-001, FR-EDU-002). Anyone can read published ones; administrators write and publish them.
// The body is Markdown and is stored as written: every client draws it with a renderer that builds elements itself and
// never inserts raw HTML, so nothing in a body can run as script.
const EducationArticle = require('../models/EducationArticle');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildMeta } = require('../utils/pagination');
const audit = require('./auditService');
const SEED = require('../config/educationSeed');

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idOf = (v) => String(v && v._id ? v._id : v);

const card = (a) => ({ _id: a._id, slug: a.slug, title: a.title, topic: a.topic, summary: a.summary || '', featured: Boolean(a.featured), publishedAt: a.publishedAt || null, readMinutes: readMinutes(a.body) });
const full = (a) => ({ ...card(a), body: a.body });
const adminView = (a) => ({ ...full(a), status: a.status, author: a.author ? { _id: idOf(a.author), name: a.author.name } : null, createdAt: a.createdAt, updatedAt: a.updatedAt });

/** Reading time at about 200 words a minute, never less than one. */
function readMinutes(body = '') {
  const words = String(body).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** A slug that is free, adding -2, -3 ... when the title was used before. Slugs never change, because they are in links. */
async function freeSlug(title) {
  const base = slugify(title) || 'article';
  let slug = base;
  for (let n = 2; await EducationArticle.exists({ slug }).setOptions({ withDeleted: true }); n += 1) slug = `${base}-${n}`;
  return slug;
}

/* ---------- public ---------- */

async function listPublished(query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const filter = { status: 'published' };
  if (query.topic) filter.topic = query.topic;
  if (query.q) filter.$or = [{ title: new RegExp(escapeRe(query.q), 'i') }, { summary: new RegExp(escapeRe(query.q), 'i') }];
  const [total, rows] = await Promise.all([
    EducationArticle.countDocuments(filter),
    EducationArticle.find(filter).sort({ featured: -1, publishedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);
  return { items: rows.map(card), meta: buildMeta({ page, limit }, total) };
}

/** A published article, with the ones either side of it so the page can offer "next". Drafts are "not found" to everyone here. */
async function getPublished(slug) {
  const a = await EducationArticle.findOne({ slug: String(slug).toLowerCase(), status: 'published' }).lean();
  if (!a) throw ApiError.notFound('Article not found');
  const all = await EducationArticle.find({ status: 'published' }).sort({ featured: -1, publishedAt: -1, createdAt: -1 }).select('slug title').lean();
  const i = all.findIndex((x) => x.slug === a.slug);
  const next = all.length > 1 ? all[(i + 1) % all.length] : null;
  return { ...full(a), next: next ? { slug: next.slug, title: next.title } : null };
}

/* ---------- administrators ---------- */

async function listAll(query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.topic) filter.topic = query.topic;
  if (query.q) filter.title = new RegExp(escapeRe(query.q), 'i');
  const [total, rows] = await Promise.all([
    EducationArticle.countDocuments(filter),
    EducationArticle.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('author', 'name').lean(),
  ]);
  return { items: rows.map(adminView), meta: buildMeta({ page, limit }, total) };
}

async function getForAdmin(id) {
  const a = await EducationArticle.findById(id).populate('author', 'name').lean();
  if (!a) throw ApiError.notFound('Article not found');
  return adminView(a);
}

async function create(admin, input, ip) {
  const publish = input.status === 'published';
  const a = await EducationArticle.create({
    title: input.title, slug: await freeSlug(input.title), topic: input.topic, summary: input.summary, body: input.body,
    featured: Boolean(input.featured), status: input.status || 'draft', author: admin.id, ...(publish ? { publishedAt: new Date() } : {}),
  });
  await audit.record(admin, publish ? 'education.published' : 'education.created', { targetType: 'EducationArticle', targetId: a._id, after: { title: a.title, status: a.status }, ip });
  return getForAdmin(a._id);
}

const EDITABLE = ['title', 'topic', 'summary', 'body', 'featured', 'status'];

async function update(admin, id, input, ip) {
  const a = await EducationArticle.findById(id);
  if (!a) throw ApiError.notFound('Article not found');
  const before = { title: a.title, status: a.status, featured: a.featured };
  for (const f of EDITABLE) if (input[f] !== undefined) a[f] = input[f];
  let action = 'education.updated';
  if (input.status === 'published' && before.status !== 'published') {
    action = 'education.published';
    if (!a.publishedAt) a.publishedAt = new Date();
  } else if (input.status === 'draft' && before.status === 'published') {
    action = 'education.unpublished';
  }
  await a.save();
  await audit.record(admin, action, { targetType: 'EducationArticle', targetId: a._id, before, after: { title: a.title, status: a.status, featured: a.featured }, ip });
  return getForAdmin(a._id);
}

/** Soft delete: the article disappears from the site and the admin list but the row stays for the audit trail. */
async function remove(admin, id, ip) {
  const a = await EducationArticle.findById(id);
  if (!a) throw ApiError.notFound('Article not found');
  await a.softDelete();
  await audit.record(admin, 'education.deleted', { targetType: 'EducationArticle', targetId: a._id, before: { title: a.title, status: a.status }, ip });
  return { _id: a._id };
}

/** Adds the seven starting guides that are missing, published. Existing articles (edited or not) are left alone. */
async function seedStarter(author) {
  let added = 0;
  for (const s of SEED) {
    const hit = await EducationArticle.exists({ slug: s.slug }).setOptions({ withDeleted: true }); // a guide an administrator deleted stays deleted
    if (hit) continue;
    await EducationArticle.create({ ...s, status: 'published', publishedAt: new Date(), author: author?._id || author });
    added += 1;
  }
  return added;
}

module.exports = { listPublished, getPublished, listAll, getForAdmin, create, update, remove, seedStarter, readMinutes, slugify };