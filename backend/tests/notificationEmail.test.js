'use strict';
require('./helpers/env');
const db = require('./helpers/db');
const mailer = require('../src/services/integrations/mailer');
const { sendForNotification, isEmailed } = require('../src/services/integrations/notificationEmail');
const { notify } = require('../src/services/notificationService');
const UserProfile = require('../src/models/UserProfile');
const { makeUser } = require('./helpers/factories');

let asha; let ravi;
const until = async (check) => { for (let i = 0; i < 100 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10)); };
const mailTo = (user) => mailer.outbox.filter((m) => m.to === user.doc.email);

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  mailer.outbox.length = 0;
  asha = await makeUser('user', { name: 'Asha Rao', emailVerified: true });
  ravi = await makeUser('technician', { name: 'Ravi Kumar', emailVerified: true });
});

describe('email for key notifications', () => {
  it('emails the person with the same words, a button to the page, and both text and HTML', async () => {
    const n = await sendForNotification([asha.id], { type: 'quotation.new', title: 'A quote is ready', body: 'Ravi quoted 1200 for the repair.', data: { deepLink: '/dashboard/requests/r1' } });
    expect(n).toBe(1);
    const [mail] = mailTo(asha);
    expect(mail.subject).toBe('A quote is ready - E-Waste Network');
    expect(mail.text).toContain('Hi Asha Rao,');
    expect(mail.text).toContain('Ravi quoted 1200 for the repair.');
    expect(mail.text).toContain('http://localhost:5173/dashboard/requests/r1');
    expect(mail.html).toContain('<a href="http://localhost:5173/dashboard/requests/r1"');
    expect(mail.html).toContain('turn email notifications off');
  });

  it('is sent after an in-app notification is saved, to everyone named, without being waited for', async () => {
    await notify([asha.id, ravi.id], { type: 'order.placed', title: 'New order', body: 'Someone ordered a laptop.', data: { deepLink: '/dashboard/orders/o1' } });
    await until(() => mailer.outbox.length >= 2);
    expect(mailTo(asha)).toHaveLength(1);
    expect(mailTo(ravi)).toHaveLength(1);
  });

  it('leaves the chatty ones in the app only', async () => {
    for (const type of ['request.progress', 'request.status', 'refurbishment.progress', 'marketplace.enquiry', 'message.new', 'something.new']) {
      expect(isEmailed(type)).toBe(false);
      expect(await sendForNotification([asha.id], { type, title: 'x', body: 'y' })).toBe(0);
    }
    expect(mailer.outbox).toHaveLength(0);
    expect(isEmailed('pickup.reminder')).toBe(true);
  });

  it('respects a person who switched email off, and one whose address is not confirmed', async () => {
    await UserProfile.create({ user: asha.id, preferences: { emailNotifications: false } });
    const unconfirmed = await makeUser('user', { name: 'New Person', emailVerified: false });
    expect(await sendForNotification([asha.id, unconfirmed.id, ravi.id], { type: 'donation.accepted', title: 'Chosen', body: 'You were chosen.' })).toBe(1);
    expect(mailTo(asha)).toHaveLength(0);
    expect(mailTo(unconfirmed)).toHaveLength(0);
    expect(mailTo(ravi)).toHaveLength(1);
  });

  it('still emails a person with no profile yet (email is on by default) and a suspended person about their suspension', async () => {
    const suspended = await makeUser('user', { name: 'Gone Quiet', emailVerified: true, status: 'suspended' });
    expect(await sendForNotification([suspended.id], { type: 'account.suspended', title: 'Your account is suspended', body: 'See why in the app.' })).toBe(1);
    expect(await sendForNotification([asha.id], { type: 'request.accepted', title: 'Accepted', body: 'A technician accepted.' })).toBe(1);
  });

  it('only turns an address on this site into a button, and escapes what it was told', async () => {
    await sendForNotification([asha.id], { type: 'request.completed', title: 'Done <b>now</b>', body: 'Body <script>alert(1)</script>', data: { deepLink: 'https://evil.example/x' } });
    await sendForNotification([asha.id], { type: 'request.completed', title: 'Done', body: 'x', data: { deepLink: '//evil.example' } });
    const [a, b] = mailTo(asha);
    expect(a.html).not.toContain('<script');
    expect(a.html).not.toContain('<b>now</b>');
    expect(a.html).not.toContain('evil.example');
    expect(b.html).not.toContain('<a href');
  });

  it('never throws or fails the notification, even when mail cannot be sent', async () => {
    const spy = jest.spyOn(mailer, 'sendMail').mockRejectedValue(new Error('smtp down'));
    expect(await sendForNotification([asha.id], { type: 'request.accepted', title: 'x', body: 'y' })).toBe(0);
    await notify(asha.id, { type: 'request.accepted', title: 'Saved anyway', body: 'y' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await require('../src/models/Notification').countDocuments({ user: asha.id })).toBe(1);
    spy.mockRestore();
  });

  it('does not count a failed send', async () => {
    const spy = jest.spyOn(mailer, 'sendMail').mockResolvedValue({ delivered: 'failed' });
    expect(await sendForNotification([asha.id], { type: 'request.accepted', title: 'x', body: 'y' })).toBe(0);
    spy.mockRestore();
  });
});