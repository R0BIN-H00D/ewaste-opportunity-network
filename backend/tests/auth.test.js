'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { MOBILE, PASSWORD, creds, signup, login, tokenFromMail, mailer } = require('./helpers/auth');
const User = require('../src/models/User');
const UserProfile = require('../src/models/UserProfile');
const TechnicianProfile = require('../src/models/TechnicianProfile');
const RecyclingCenter = require('../src/models/RecyclingCenter');
const RefreshToken = require('../src/models/RefreshToken');
const { sha256 } = require('../src/utils/crypto');

const app = createApp();
const post = (path, body, headers = {}) => request(app).post(`/api/auth${path}`).set(headers).send(body);

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  mailer.outbox.length = 0;
});

describe('register', () => {
  it('creates a normal user with a profile, a session cookie and a verification email', async () => {
    const body = creds();
    const res = await post('/register', body);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ name: body.name, email: body.email, role: 'user', status: 'active', emailVerified: false });
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.refreshToken).toBeUndefined(); // web gets it as a cookie only
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/ewaste_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion|failedLogins/);

    expect(await UserProfile.countDocuments({ user: res.body.data.user._id })).toBe(1);
    expect(tokenFromMail(body.email, '/verify-email')).toBeTruthy();
  });

  it('returns the refresh token in the body for mobile clients', async () => {
    const res = await post('/register', creds(), MOBILE);
    expect(res.status).toBe(201);
    expect(typeof res.body.data.refreshToken).toBe('string');
  });

  it('puts provider roles in pending_verification and creates their role profile', async () => {
    const res = await post('/register', creds({ role: 'technician' }));
    expect(res.status).toBe(201);
    expect(res.body.data.user.status).toBe('pending_verification');
    const profile = await TechnicianProfile.findOne({ user: res.body.data.user._id });
    expect(profile.verification.status).toBe('not_submitted');
  });

  it('requires an organization name for recyclers and refurbishers', async () => {
    const missing = await post('/register', creds({ role: 'recycler' }));
    expect(missing.status).toBe(422);
    expect(missing.body.errors.map((e) => e.field)).toContain('body.organizationName');

    const ok = await post('/register', creds({ role: 'recycler', organizationName: 'GreenLoop Recyclers' }));
    expect(ok.status).toBe(201);
    const center = await RecyclingCenter.findOne({ user: ok.body.data.user._id });
    expect(center.name).toBe('GreenLoop Recyclers');
  });

  it('never lets someone register as admin or set their own status', async () => {
    expect((await post('/register', creds({ role: 'admin' }))).status).toBe(422);
    expect((await post('/register', creds({ status: 'active' }))).status).toBe(422);
    expect(await User.countDocuments({})).toBe(0);
  });

  it.each([['short1'], ['onlyletters'], ['12345678']])('rejects the weak password %s', async (password) => {
    const res = await post('/register', creds({ password }));
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('body.password');
  });

  it('rejects a duplicate email regardless of letter case', async () => {
    const first = creds({ email: 'dup@test.local' });
    expect((await post('/register', first)).status).toBe(201);
    const second = await post('/register', creds({ email: 'DUP@Test.Local' }));
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('EMAIL_TAKEN');
  });
});

describe('login', () => {
  it('logs in and records the login time', async () => {
    const u = await signup(app);
    const res = await login(app, u.email);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(u.email);
    expect(res.body.data.accessToken).toBeTruthy();
    expect((await User.findById(u.id)).lastLoginAt).toBeInstanceOf(Date);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const u = await signup(app);
    const wrong = await login(app, u.email, 'Wrong-pass1');
    const unknown = await login(app, 'nobody@test.local');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('locks the account after 5 failed attempts, even for the right password', async () => {
    const u = await signup(app);
    for (let i = 0; i < 5; i += 1) expect((await login(app, u.email, 'Wrong-pass1')).status).toBe(401);
    const locked = await login(app, u.email);
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');

    await User.updateOne({ _id: u.id }, { $set: { lockUntil: new Date(Date.now() - 1000) } }); // lock expires
    expect((await login(app, u.email)).status).toBe(200);
  });

  it('refuses suspended accounts (403) and deleted accounts (401)', async () => {
    const s = await signup(app);
    await User.updateOne({ _id: s.id }, { $set: { status: 'suspended' } });
    const suspended = await login(app, s.email);
    expect(suspended.status).toBe(403);
    expect(suspended.body.code).toBe('ACCOUNT_SUSPENDED');

    const d = await signup(app);
    await User.updateOne({ _id: d.id }, { $set: { status: 'deleted' } });
    expect((await login(app, d.email)).status).toBe(401);
  });

  it('validates the payload', async () => {
    expect((await post('/login', { email: 'not-an-email', password: 'x' })).status).toBe(422);
    expect((await post('/login', { email: 'a@test.local' })).status).toBe(422);
  });
});

describe('refresh tokens', () => {
  it('rotates: each refresh returns a new refresh token and a working access token', async () => {
    const u = await signup(app);
    const res = await post('/refresh', { refreshToken: u.refreshToken }, MOBILE);
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).not.toBe(u.refreshToken);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
  });

  it('treats reuse of a rotated token as theft and kills the whole session chain', async () => {
    const u = await signup(app);
    const next = await post('/refresh', { refreshToken: u.refreshToken }, MOBILE);
    await RefreshToken.updateMany({ revokedAt: { $ne: null } }, { $set: { revokedAt: new Date(Date.now() - 60_000) } }); // well past the grace window
    const reuse = await post('/refresh', { refreshToken: u.refreshToken }, MOBILE);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('TOKEN_REUSED');
    const newest = await post('/refresh', { refreshToken: next.body.data.refreshToken }, MOBILE);
    expect(newest.status).toBe(401); // the legitimate holder is logged out too
  });

  it('treats a second refresh with the same token a moment later as a race, not theft', async () => {
    const u = await signup(app);
    const first = await post('/refresh', { refreshToken: u.refreshToken }, MOBILE);
    const second = await post('/refresh', { refreshToken: u.refreshToken }, MOBILE);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.refreshToken).not.toBe(first.body.data.refreshToken);
    expect((await post('/refresh', { refreshToken: first.body.data.refreshToken }, MOBILE)).status).toBe(200);
    expect((await post('/refresh', { refreshToken: second.body.data.refreshToken }, MOBILE)).status).toBe(200);
  });

  it('allows the race only twice, then treats further reuse as theft', async () => {
    const u = await signup(app);
    await post('/refresh', { refreshToken: u.refreshToken }, MOBILE);
    expect((await post('/refresh', { refreshToken: u.refreshToken }, MOBILE)).status).toBe(200);
    expect((await post('/refresh', { refreshToken: u.refreshToken }, MOBILE)).status).toBe(200);
    const third = await post('/refresh', { refreshToken: u.refreshToken }, MOBILE);
    expect(third.status).toBe(401);
    expect(third.body.code).toBe('TOKEN_REUSED');
  });

  it('never gives the grace to a token that was revoked by logging out', async () => {
    const u = await signup(app);
    await post('/logout', { refreshToken: u.refreshToken }, MOBILE);
    const again = await post('/refresh', { refreshToken: u.refreshToken }, MOBILE);
    expect(again.status).toBe(401);
  });

  it('works with the httpOnly cookie, but only with the CSRF header', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: (await signup(app)).email, password: PASSWORD });
    const blocked = await agent.post('/api/auth/refresh').send({});
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('CSRF_BLOCKED');
    const ok = await agent.post('/api/auth/refresh').set('X-Requested-With', 'ewaste-web').send({});
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toBeTruthy();
  });

  it('rejects expired, unknown and missing tokens', async () => {
    const u = await signup(app);
    await RefreshToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await post('/refresh', { refreshToken: u.refreshToken }, MOBILE);
    expect(expired.status).toBe(401);
    expect(expired.body.code).not.toBe('TOKEN_REUSED');
    expect((await post('/refresh', { refreshToken: 'x'.repeat(43) }, MOBILE)).status).toBe(401);
    expect((await post('/refresh', {}, MOBILE)).status).toBe(401);
  });

  it('stores only a hash of the refresh token', async () => {
    const u = await signup(app);
    expect(await RefreshToken.countDocuments({ tokenHash: u.refreshToken })).toBe(0);
    expect(await RefreshToken.countDocuments({ tokenHash: sha256(u.refreshToken) })).toBe(1);
  });

  it('stops refreshing for a user who gets suspended', async () => {
    const u = await signup(app);
    await User.updateOne({ _id: u.id }, { $set: { status: 'suspended' } });
    const res = await post('/refresh', { refreshToken: u.refreshToken }, MOBILE);
    expect(res.status).toBe(403);
  });
});

describe('logout', () => {
  it('revokes the session so its refresh token stops working', async () => {
    const u = await signup(app);
    expect((await post('/logout', { refreshToken: u.refreshToken }, MOBILE)).status).toBe(200);
    expect((await post('/refresh', { refreshToken: u.refreshToken }, MOBILE)).status).toBe(401);
  });

  it('is idempotent and does not need a token', async () => {
    expect((await post('/logout', {})).status).toBe(200);
    expect((await post('/logout', { refreshToken: 'y'.repeat(43) })).status).toBe(200);
  });

  it('logout-all ends every session and invalidates access tokens', async () => {
    const u = await signup(app);
    const second = await login(app, u.email);
    expect((await request(app).post('/api/auth/logout-all').set(u.auth)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(u.auth)).status).toBe(401);
    expect((await post('/refresh', { refreshToken: second.body.data.refreshToken }, MOBILE)).status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('needs a token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer nope')).status).toBe(401);
  });

  it('returns the user, profile and (for providers) the role profile with its verification state', async () => {
    const u = await signup(app, { role: 'technician' });
    const res = await request(app).get('/api/auth/me').set(u.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: u.email, role: 'technician', status: 'pending_verification' });
    expect(res.body.data.verification.status).toBe('not_submitted');
    expect(res.body.data.roleProfile).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });
});

describe('password reset', () => {
  it('answers the same for unknown emails and sends nothing', async () => {
    const res = await post('/forgot-password', { email: 'ghost@test.local' });
    expect(res.status).toBe(200);
    expect(mailer.outbox.filter((m) => m.to === 'ghost@test.local')).toHaveLength(0);
  });

  it('resets once, ends old sessions and lets the new password in', async () => {
    const u = await signup(app);
    expect((await post('/forgot-password', { email: u.email })).status).toBe(200);
    const token = tokenFromMail(u.email, '/reset-password');
    expect(token).toBeTruthy();

    expect((await post('/reset-password', { token, password: 'Brand-new-9' })).status).toBe(200);
    expect((await login(app, u.email, PASSWORD)).status).toBe(401);
    expect((await login(app, u.email, 'Brand-new-9')).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(u.auth)).status).toBe(401); // old access token
    expect((await post('/refresh', { refreshToken: u.refreshToken }, MOBILE)).status).toBe(401);

    expect((await post('/reset-password', { token, password: 'Another-pass-1' })).status).toBe(400); // single use
  });

  it('rejects expired, unknown and weak-password resets', async () => {
    const u = await signup(app);
    await post('/forgot-password', { email: u.email });
    const token = tokenFromMail(u.email, '/reset-password');

    expect((await post('/reset-password', { token, password: 'weak' })).status).toBe(422);
    expect((await post('/reset-password', { token: 'z'.repeat(43), password: 'Brand-new-9' })).status).toBe(400);

    await User.updateOne({ _id: u.id }, { $set: { passwordResetExpires: new Date(Date.now() - 1000) } });
    expect((await post('/reset-password', { token, password: 'Brand-new-9' })).status).toBe(400);
  });

  it('stores only a hash of the reset token', async () => {
    const u = await signup(app);
    await post('/forgot-password', { email: u.email });
    const token = tokenFromMail(u.email, '/reset-password');
    expect(await User.countDocuments({ passwordResetTokenHash: token })).toBe(0);
    expect(await User.countDocuments({ passwordResetTokenHash: sha256(token) })).toBe(1);
  });
});

describe('email verification', () => {
  it('verifies once with the emailed link', async () => {
    const u = await signup(app);
    const token = tokenFromMail(u.email, '/verify-email');
    expect((await post('/verify-email', { token })).status).toBe(200);
    expect((await User.findById(u.id)).emailVerified).toBe(true);
    expect((await post('/verify-email', { token })).status).toBe(400);
  });

  it('rejects expired links', async () => {
    const u = await signup(app);
    const token = tokenFromMail(u.email, '/verify-email');
    await User.updateOne({ _id: u.id }, { $set: { emailVerifyExpires: new Date(Date.now() - 1000) } });
    expect((await post('/verify-email', { token })).status).toBe(400);
  });

  it('resends a fresh link, and refuses once verified', async () => {
    const u = await signup(app);
    const before = mailer.outbox.length;
    expect((await request(app).post('/api/auth/resend-verification').set(u.auth)).status).toBe(200);
    expect(mailer.outbox.length).toBe(before + 1);

    await post('/verify-email', { token: tokenFromMail(u.email, '/verify-email') });
    const again = await request(app).post('/api/auth/resend-verification').set(u.auth);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_VERIFIED');
  });
});

describe('email verification by code', () => {
  const codeFromMail = (to) => {
    const mail = [...mailer.outbox].reverse().find((m) => m.to === to);
    return /(\d{6})/.exec(mail.subject)[1];
  };
  const verifyCode = (u, code) => request(app).post('/api/auth/verify-email-code').set(u.auth).send({ code });

  it('emails a 6-digit code at sign-up and verifies when it is entered', async () => {
    const u = await signup(app);
    const code = codeFromMail(u.email);
    expect(code).toMatch(/^\d{6}$/);
    expect(mailer.outbox.at(-1).text).toContain(`Your code: ${code}`);
    expect((await verifyCode(u, code)).status).toBe(200);
    expect((await User.findById(u.id)).emailVerified).toBe(true);
    expect((await verifyCode(u, code)).status).toBe(200); // already verified: nothing more to do
  });

  it('refuses a wrong code, says how many tries are left, and locks after five', async () => {
    const u = await signup(app);
    const code = codeFromMail(u.email);
    const wrong = code === '000000' ? '111111' : '000000';
    const first = await verifyCode(u, wrong);
    expect(first.status).toBe(400);
    expect(first.body.message).toMatch(/4 tries left/);
    for (let i = 0; i < 4; i += 1) await verifyCode(u, wrong);
    const locked = await verifyCode(u, code);
    expect(locked.status).toBe(429);
    expect((await User.findById(u.id)).emailVerified).toBe(false);

    await request(app).post('/api/auth/resend-verification').set(u.auth); // a new code clears the lock
    expect((await verifyCode(u, codeFromMail(u.email))).status).toBe(200);
  });

  it('rejects an expired code and a badly shaped one', async () => {
    const u = await signup(app);
    const code = codeFromMail(u.email);
    expect((await verifyCode(u, '12ab')).status).toBe(422);
    await User.updateOne({ _id: u.id }, { $set: { emailVerifyCodeExpires: new Date(Date.now() - 1000) } });
    const res = await verifyCode(u, code);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/);
  });

  it('only works for the signed-in person, and a code from another account does not work', async () => {
    const a = await signup(app);
    const b = await signup(app);
    expect((await request(app).post('/api/auth/verify-email-code').send({ code: codeFromMail(a.email) })).status).toBe(401);
    expect((await verifyCode(b, codeFromMail(a.email))).status).toBe(400);
    expect((await User.findById(b.id)).emailVerified).toBe(false);
  });
});

describe('change password', () => {
  it('needs the current password', async () => {
    const u = await signup(app);
    const res = await request(app).post('/api/auth/change-password').set(u.auth).send({ currentPassword: 'Wrong-pass1', newPassword: 'Brand-new-9' });
    expect(res.status).toBe(400);
  });

  it('signs other devices out but keeps this one signed in', async () => {
    const u = await signup(app);
    const res = await request(app).post('/api/auth/change-password').set(MOBILE).set(u.auth).send({ currentPassword: PASSWORD, newPassword: 'Brand-new-9' });
    expect(res.status).toBe(200);

    expect((await request(app).get('/api/auth/me').set(u.auth)).status).toBe(401); // old token dead
    const fresh = { Authorization: `Bearer ${res.body.data.accessToken}` };
    expect((await request(app).get('/api/auth/me').set(fresh)).status).toBe(200);
    expect((await post('/refresh', { refreshToken: u.refreshToken }, MOBILE)).status).toBe(401);
    expect((await login(app, u.email, 'Brand-new-9')).status).toBe(200);
  });
});

describe('sessions', () => {
  it('lists active sessions without secrets and revokes one', async () => {
    const u = await signup(app);
    const second = await login(app, u.email);
    const list = await request(app).get('/api/auth/sessions').set(u.auth);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(JSON.stringify(list.body)).not.toMatch(/tokenHash|family/);

    const doc = await RefreshToken.findOne({ tokenHash: sha256(second.body.data.refreshToken) });
    expect((await request(app).delete(`/api/auth/sessions/${doc._id}`).set(u.auth)).status).toBe(200);
    expect((await post('/refresh', { refreshToken: second.body.data.refreshToken }, MOBILE)).status).toBe(401);
    expect((await post('/refresh', { refreshToken: u.refreshToken }, MOBILE)).status).toBe(200); // other session unaffected
  });

  it("will not touch another person's session", async () => {
    const a = await signup(app);
    const b = await signup(app);
    const doc = await RefreshToken.findOne({ tokenHash: sha256(b.refreshToken) });
    expect((await request(app).delete(`/api/auth/sessions/${doc._id}`).set(a.auth)).status).toBe(404);
  });
});
