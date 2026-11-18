'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { PNG } = require('./helpers/factories');
const { signup, mailer } = require('./helpers/auth');
const VerificationDocument = require('../src/models/VerificationDocument');
const TechnicianProfile = require('../src/models/TechnicianProfile');

const app = createApp();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF');
const FAKE = Buffer.from('this is not an image or a pdf at all');

const submit = (u, docType = 'id_proof', files = [[PNG, 'id.png', 'image/png']]) => {
  let r = request(app).post('/api/verification/documents').set(u.auth);
  if (docType !== null) r = r.field('docType', docType); // null = omit the field
  for (const [buf, filename, contentType] of files) r = r.attach('documents', buf, { filename, contentType });
  return r;
};
const status = (u) => request(app).get('/api/verification/status').set(u.auth);

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  mailer.outbox.length = 0;
});

describe('submitting documents', () => {
  it('moves a technician to "pending" and never reveals where files are stored', async () => {
    const u = await signup(app, { role: 'technician' });
    const res = await submit(u, 'id_proof', [[PNG, 'id.png', 'image/png'], [PDF, 'cert.pdf', 'application/pdf']]);
    expect(res.status).toBe(201);
    expect(res.body.data.verificationStatus).toBe('pending');
    expect(res.body.data.documents).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/publicId|_private|storage/);

    const s = await status(u);
    expect(s.body.data.status).toBe('pending');
    expect(s.body.data.documents).toHaveLength(2);
    expect(s.body.data.allowedDocTypes).toContain('qualification');
    expect((await TechnicianProfile.findOne({ user: u.id })).verification.status).toBe('pending');
  });

  it('is only for provider accounts', async () => {
    const u = await signup(app, { role: 'user' });
    expect((await submit(u)).status).toBe(403);
    expect((await status(u)).status).toBe(403);
    expect((await request(app).get('/api/verification/status')).status).toBe(401);
  });

  it('only accepts document types that fit the role', async () => {
    const tech = await signup(app, { role: 'technician' });
    expect((await submit(tech, 'business')).status).toBe(422);
    expect((await submit(tech, 'passport')).status).toBe(422);
    expect((await submit(tech, null)).status).toBe(422);
    const refurb = await signup(app, { role: 'refurbisher', organizationName: 'ReNew Electronics' });
    expect((await submit(refurb, 'business')).status).toBe(201);
  });

  it('checks the real file type, not the label', async () => {
    const u = await signup(app, { role: 'technician' });
    expect((await submit(u, 'id_proof', [[FAKE, 'id.png', 'image/png']])).status).toBe(422);
    expect((await submit(u, 'id_proof', [[FAKE, 'id.exe', 'application/octet-stream']])).status).toBe(422);
    expect((await submit(u, 'id_proof', [])).status).toBe(422); // no file
    expect(await VerificationDocument.countDocuments({})).toBe(0);
    expect((await TechnicianProfile.findOne({ user: u.id })).verification.status).toBe('not_submitted');
  });

  it('caps the number of stored documents', async () => {
    const u = await signup(app, { role: 'technician' });
    const three = [[PNG, 'a.png', 'image/png'], [PNG, 'b.png', 'image/png'], [PNG, 'c.png', 'image/png']];
    for (let i = 0; i < 3; i += 1) expect((await submit(u, 'other', three)).status).toBe(201);
    const over = await submit(u, 'other', [[PNG, 'd.png', 'image/png'], [PNG, 'e.png', 'image/png']]);
    expect(over.status).toBe(422);
    expect(await VerificationDocument.countDocuments({ owner: u.id })).toBe(9);
  });

  it('re-opens review after a rejection and clears the old reason', async () => {
    const u = await signup(app, { role: 'technician' });
    await TechnicianProfile.updateOne({ user: u.id }, { $set: { verification: { status: 'rejected', reason: 'Blurry ID' } } });
    expect((await status(u)).body.data).toMatchObject({ status: 'rejected', reason: 'Blurry ID' });
    expect((await submit(u)).status).toBe(201);
    const after = (await status(u)).body.data;
    expect(after.status).toBe('pending');
    expect(after.reason).toBeUndefined();
  });

  it('does not serve private files over HTTP', async () => {
    const u = await signup(app, { role: 'technician' });
    await submit(u);
    const doc = await VerificationDocument.findOne({ owner: u.id });
    expect((await request(app).get(`/uploads/${doc.file.publicId}`)).status).toBe(404);
    expect((await request(app).get(`/uploads/_private/${doc.file.publicId}`)).status).toBe(404);
  });
});

describe('deleting documents', () => {
  it('deleting the only pending document returns the submission to "not submitted"', async () => {
    const u = await signup(app, { role: 'technician' });
    const { body } = await submit(u);
    const id = body.data.documents[0]._id;
    expect((await request(app).delete(`/api/verification/documents/${id}`).set(u.auth)).status).toBe(200);
    expect(await VerificationDocument.countDocuments({ owner: u.id })).toBe(0);
    expect((await status(u)).body.data.status).toBe('not_submitted');
  });

  it('keeps the submission pending while other documents are waiting', async () => {
    const u = await signup(app, { role: 'technician' });
    const { body } = await submit(u, 'id_proof', [[PNG, 'a.png', 'image/png'], [PNG, 'b.png', 'image/png']]);
    await request(app).delete(`/api/verification/documents/${body.data.documents[0]._id}`).set(u.auth);
    expect((await status(u)).body.data.status).toBe('pending');
  });

  it('refuses to delete approved documents', async () => {
    const u = await signup(app, { role: 'technician' });
    const { body } = await submit(u);
    await VerificationDocument.updateOne({ _id: body.data.documents[0]._id }, { $set: { status: 'approved' } });
    const res = await request(app).delete(`/api/verification/documents/${body.data.documents[0]._id}`).set(u.auth);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DOC_APPROVED');
  });

  it("will not touch someone else's document", async () => {
    const a = await signup(app, { role: 'technician' });
    const b = await signup(app, { role: 'technician' });
    const { body } = await submit(a);
    expect((await request(app).delete(`/api/verification/documents/${body.data.documents[0]._id}`).set(b.auth)).status).toBe(404);
    expect(await VerificationDocument.countDocuments({ owner: a.id })).toBe(1);
  });
});
