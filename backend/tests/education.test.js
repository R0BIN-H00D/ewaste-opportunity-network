'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const EducationArticle = require('../src/models/EducationArticle');
const AdminLog = require('../src/models/AdminLog');
const education = require('../src/services/educationService');
const { makeUser, authHeader } = require('./helpers/factories');

const app = createApp();
let admin; let user; let tech;

const call = (method, url, who, body) => {
  const r = request(app)[method](url);
  if (who) r.set(authHeader(who));
  return body === undefined ? r : r.send(body);
};
const BODY = '## Why it matters\n\nOld phones hold metals worth recovering, so hand them to a reuse or recycling channel.';
const article = (over = {}) => ({ title: 'Why repair beats replace', topic: 'repair-benefits', summary: 'A short reason.', body: BODY, ...over });

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  admin = await makeUser('admin');
  user = await makeUser('user');
  tech = await makeUser('technician');
});

describe('the seven starting guides', () => {
  it('are added once, published, and never overwrite an edited or deleted one', async () => {
    expect(await education.seedStarter(admin.doc)).toBe(7);
    expect(await education.seedStarter(admin.doc)).toBe(0);
    const list = await call('get', '/api/education');
    expect(list.body.data).toHaveLength(7);
    expect(list.body.data.map((a) => a.topic).sort()).toEqual(['data-security', 'ewaste-problem', 'recycling', 'repair-benefits', 'reuse', 'safe-disposal', 'sustainability']);
    expect(list.body.data[0].slug).toBe('protect-your-data'); // the featured one comes first

    await call('put', `/api/admin/education/${(await EducationArticle.findOne({ slug: 'safe-disposal' }))._id}`, admin, { title: 'My own title' });
    await call('delete', `/api/admin/education/${(await EducationArticle.findOne({ slug: 'reuse-and-donation' }))._id}`, admin);
    expect(await education.seedStarter(admin.doc)).toBe(0);
    expect((await EducationArticle.findOne({ slug: 'safe-disposal' })).title).toBe('My own title');
    expect((await call('get', '/api/education')).body.data).toHaveLength(6);
  });
});

describe('GET /api/education (public)', () => {
  beforeEach(() => education.seedStarter(admin.doc));

  it('lists published articles as cards, with no body, and pages them', async () => {
    const res = await call('get', '/api/education?limit=3&page=2');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 3, total: 7 });
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0]).not.toHaveProperty('body');
    expect(res.body.data[0]).toEqual(expect.objectContaining({ slug: expect.any(String), title: expect.any(String), readMinutes: expect.any(Number) }));
  });

  it('filters by topic and by words in the title or summary', async () => {
    expect((await call('get', '/api/education?topic=recycling')).body.data.map((a) => a.slug)).toEqual(['recycling-explained']);
    expect((await call('get', '/api/education?q=repair')).body.data.length).toBeGreaterThan(0);
    expect((await call('get', '/api/education?q=zzzz')).body.data).toEqual([]);
    expect((await call('get', '/api/education?q=.*')).body.data).toEqual([]); // a pattern is text, not a regular expression
  });

  it('checks its query', async () => {
    expect((await call('get', '/api/education?topic=nope')).status).toBe(422);
    expect((await call('get', '/api/education?foo=1')).status).toBe(422);
    expect((await call('get', '/api/education?q[$ne]=x')).status).toBe(422);
  });

  it('shows one article with its body and the one to read next', async () => {
    const res = await call('get', '/api/education/safe-disposal');
    expect(res.status).toBe(200);
    expect(res.body.data.body).toMatch(/authorised recycling centre/);
    expect(res.body.data.next).toMatchObject({ slug: expect.any(String), title: expect.any(String) });
    expect(res.body.data.next.slug).not.toBe('safe-disposal');
  });

  it('says "not found" for a draft, a deleted article and a slug that does not exist, the same way', async () => {
    const draft = await call('post', '/api/admin/education', admin, article());
    expect(draft.body.data.status).toBe('draft');
    const gone = await EducationArticle.findOne({ slug: 'sustainability-at-home' });
    await call('delete', `/api/admin/education/${gone._id}`, admin);
    for (const slug of [draft.body.data.slug, 'sustainability-at-home', 'no-such-thing']) {
      const res = await call('get', `/api/education/${slug}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Article not found');
    }
    expect((await call('get', '/api/education')).body.data.map((a) => a.slug)).not.toContain(draft.body.data.slug);
  });

  it('does not need a login, and does not leak who wrote it', async () => {
    const res = await call('get', '/api/education/safe-disposal');
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('author');
  });
});

describe('administering articles', () => {
  it('is for administrators only, on every route', async () => {
    const a = await call('post', '/api/admin/education', admin, article());
    const id = a.body.data._id;
    const routes = [['get', '/api/admin/education'], ['post', '/api/admin/education', article()], ['get', `/api/admin/education/${id}`], ['put', `/api/admin/education/${id}`, { title: 'Changed title' }], ['delete', `/api/admin/education/${id}`]];
    for (const [method, url, body] of routes) {
      expect((await call(method, url, null, body)).status).toBe(401);
      for (const who of [user, tech]) expect((await call(method, url, who, body)).status).toBe(403);
    }
    expect((await EducationArticle.findById(id)).title).toBe('Why repair beats replace');
  });

  it('creates a draft, then publishes it, and the first publish date is kept after later edits', async () => {
    const made = await call('post', '/api/admin/education', admin, article());
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ slug: 'why-repair-beats-replace', status: 'draft', publishedAt: null, author: { name: admin.doc.name } });
    const id = made.body.data._id;

    const live = await call('put', `/api/admin/education/${id}`, admin, { status: 'published' });
    expect(live.body.data.status).toBe('published');
    const firstDate = live.body.data.publishedAt;
    expect(firstDate).toBeTruthy();
    expect((await call('get', '/api/education/why-repair-beats-replace')).status).toBe(200);

    await call('put', `/api/admin/education/${id}`, admin, { status: 'draft' });
    expect((await call('get', '/api/education/why-repair-beats-replace')).status).toBe(404);
    const again = await call('put', `/api/admin/education/${id}`, admin, { status: 'published', summary: 'A newer summary.' });
    expect(again.body.data.publishedAt).toBe(firstDate);
    expect(again.body.data.summary).toBe('A newer summary.');
  });

  it('keeps the slug when the title changes, and gives a repeated title its own', async () => {
    const a = await call('post', '/api/admin/education', admin, article());
    const b = await call('post', '/api/admin/education', admin, article());
    expect([a.body.data.slug, b.body.data.slug]).toEqual(['why-repair-beats-replace', 'why-repair-beats-replace-2']);
    const renamed = await call('put', `/api/admin/education/${a.body.data._id}`, admin, { title: 'A completely new title' });
    expect(renamed.body.data.slug).toBe('why-repair-beats-replace');
    await call('delete', `/api/admin/education/${b.body.data._id}`, admin);
    const c = await call('post', '/api/admin/education', admin, article());
    expect(c.body.data.slug).toBe('why-repair-beats-replace-3'); // a deleted article's slug is not handed out again
  });

  it('can create an article already published', async () => {
    const res = await call('post', '/api/admin/education', admin, article({ status: 'published', featured: true }));
    expect(res.body.data).toMatchObject({ status: 'published', featured: true });
    expect(res.body.data.publishedAt).toBeTruthy();
    expect((await call('get', '/api/education')).body.data[0].slug).toBe('why-repair-beats-replace');
  });

  it('lists drafts too, with filters', async () => {
    await call('post', '/api/admin/education', admin, article());
    await call('post', '/api/admin/education', admin, article({ title: 'Safe handover of laptops', topic: 'data-security', status: 'published' }));
    const all = await call('get', '/api/admin/education', admin);
    expect(all.body.data).toHaveLength(2);
    expect((await call('get', '/api/admin/education?status=draft', admin)).body.data).toHaveLength(1);
    expect((await call('get', '/api/admin/education?topic=data-security', admin)).body.data[0].title).toBe('Safe handover of laptops');
    expect((await call('get', '/api/admin/education?q=laptops', admin)).body.data).toHaveLength(1);
    expect((await call('get', '/api/admin/education?status=bogus', admin)).status).toBe(422);
  });

  it('checks what is written: title, topic, body length, unknown fields, ids', async () => {
    const bad = [
      article({ title: 'ab' }), article({ topic: 'cooking' }), article({ body: 'short' }), article({ body: 'x'.repeat(20001) }),
      article({ status: 'archived' }), { ...article(), slug: 'my-own-slug' }, { ...article(), author: 'someone' },
    ];
    for (const body of bad) expect((await call('post', '/api/admin/education', admin, body)).status).toBe(422);
    expect((await call('put', '/api/admin/education/abc', admin, { title: 'Valid title' })).status).toBe(404);
    expect((await call('put', `/api/admin/education/${admin.id}`, admin, { title: 'Valid title' })).status).toBe(404);
    const made = await call('post', '/api/admin/education', admin, article());
    expect((await call('put', `/api/admin/education/${made.body.data._id}`, admin, {})).status).toBe(422);
    expect(await EducationArticle.countDocuments()).toBe(1);
  });

  it('keeps markup as text: nothing is cleaned or run on the server, and the body comes back as written', async () => {
    const body = 'Read <script>alert(1)</script> and [a link](javascript:alert(1)) carefully, then do the right thing.';
    const made = await call('post', '/api/admin/education', admin, article({ body, status: 'published' }));
    expect((await call('get', `/api/education/${made.body.data.slug}`)).body.data.body).toBe(body);
  });

  it('writes every change to the audit log, with who and what', async () => {
    const made = await call('post', '/api/admin/education', admin, article());
    const id = made.body.data._id;
    await call('put', `/api/admin/education/${id}`, admin, { status: 'published' });
    await call('put', `/api/admin/education/${id}`, admin, { title: 'A new title here' });
    await call('put', `/api/admin/education/${id}`, admin, { status: 'draft' });
    await call('delete', `/api/admin/education/${id}`, admin);
    const rows = await AdminLog.find({ targetType: 'EducationArticle' }).sort({ createdAt: 1 }).lean();
    expect(rows.map((r) => r.action)).toEqual(['education.created', 'education.published', 'education.updated', 'education.unpublished', 'education.deleted']);
    expect(String(rows[0].admin)).toBe(admin.id);
  });

  it('estimates reading time', () => {
    expect(education.readMinutes('word '.repeat(10))).toBe(1);
    expect(education.readMinutes('word '.repeat(450))).toBe(2);
    expect(education.readMinutes('')).toBe(1);
  });
});