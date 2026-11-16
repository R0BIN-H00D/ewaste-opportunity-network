'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const { mailer } = require('./helpers/auth');

const app = createApp();
const send = (body) => request(app).post('/api/contact').send(body);
const valid = { name: 'Asha Rao', email: 'Asha@Test.Local', subject: 'Pickup   question', message: 'Do you pick up old printers in my area?' };

beforeEach(() => {
  mailer.outbox.length = 0;
});

describe('POST /api/contact', () => {
  it('delivers the message to support with the sender as reply-to', async () => {
    const res = await send(valid);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mailer.outbox).toHaveLength(1);
    const mail = mailer.outbox[0];
    expect(mail.replyTo).toBe('asha@test.local');
    expect(mail.subject).toBe('[Contact] Pickup question'); // whitespace collapsed
    expect(mail.text).toContain('Do you pick up old printers');
  });

  it('needs no login', async () => {
    expect((await send(valid)).status).toBe(200);
  });

  it.each([
    ['missing name', { ...valid, name: '' }],
    ['bad email', { ...valid, email: 'nope' }],
    ['short subject', { ...valid, subject: 'hi' }],
    ['short message', { ...valid, message: 'too short' }],
    ['huge message', { ...valid, message: 'x'.repeat(2001) }],
    ['unknown field', { ...valid, to: 'victim@example.com' }],
  ])('rejects %s with 422 and sends nothing', async (_label, body) => {
    const res = await send(body);
    expect(res.status).toBe(422);
    expect(mailer.outbox).toHaveLength(0);
  });

  it('cannot be used to inject mail headers', async () => {
    const res = await send({ ...valid, subject: 'Hello\r\nBcc: victim@example.com' });
    expect(res.status).toBe(200);
    expect(mailer.outbox[0].subject).not.toMatch(/[\r\n]/);
  });
});
