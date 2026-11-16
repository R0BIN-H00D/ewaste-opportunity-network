'use strict';
require('./helpers/env');
const db = require('./helpers/db');
const { makeUser } = require('./helpers/factories');
const { canTransition, transition } = require('../src/services/accountStatus');
const User = require('../src/models/User');
const RefreshToken = require('../src/models/RefreshToken');

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(db.clear);

describe('account status rules', () => {
  it('allows only the documented transitions', () => {
    expect(canTransition('pending_verification', 'active')).toBe(true);
    expect(canTransition('active', 'suspended')).toBe(true);
    expect(canTransition('suspended', 'active')).toBe(true);
    expect(canTransition('active', 'pending_verification')).toBe(false);
    expect(canTransition('deleted', 'active')).toBe(false);
    expect(canTransition('active', 'active')).toBe(false);
  });

  it('suspending needs a reason, records who did it, and ends every session', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('user');
    await RefreshToken.create({ user: target.id, tokenHash: 'h1', family: 'f1', expiresAt: new Date(Date.now() + 1e7) });

    await expect(transition(target.id, 'suspended', { by: admin.id })).rejects.toMatchObject({ statusCode: 422 });

    const user = await transition(target.id, 'suspended', { by: admin.id, reason: 'Spam listings' });
    expect(user.status).toBe('suspended');
    expect(user.suspension.reason).toBe('Spam listings');
    expect(String(user.suspension.by)).toBe(admin.id);
    expect((await User.findById(target.id)).tokenVersion).toBe(1); // every access token is now invalid
    expect(await RefreshToken.countDocuments({ user: target.id, revokedAt: null })).toBe(0);
  });

  it('reactivating clears the suspension record', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('user');
    await transition(target.id, 'suspended', { by: admin.id, reason: 'Test' });
    const back = await transition(target.id, 'active', { by: admin.id });
    expect(back.status).toBe('active');
    expect((await User.findById(target.id)).suspension?.reason).toBeUndefined();
  });

  it('rejects illegal moves with 409 and unknown users with 404', async () => {
    const target = await makeUser('user', { status: 'deleted' });
    await expect(transition(target.id, 'active')).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_TRANSITION' });
    await expect(transition('64b7f0f0f0f0f0f0f0f0f0f0', 'active')).rejects.toMatchObject({ statusCode: 404 });
  });
});
