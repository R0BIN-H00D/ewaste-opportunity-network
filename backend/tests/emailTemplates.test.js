'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const mailer = require('../src/services/integrations/mailer');
const { renderEmail, escapeHtml } = require('../src/services/integrations/emailTemplates');
const { makeUser } = require('./helpers/factories');

const app = createApp();
beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => { await db.clear(); mailer.outbox.length = 0; });

describe('the email layout', () => {
  it('gives an HTML version and a plain-text version with the same words and the same link', () => {
    const { html, text } = renderEmail({ title: 'Confirm', greeting: 'Hi Asha,', paragraphs: ['First.', 'Second.'], button: { label: 'Go', url: 'https://example.org/x?token=abc' }, footer: 'Ignore if not you.' });
    expect(html).toContain('<a href="https://example.org/x?token=abc"');
    expect(html).toContain('Hi Asha,');
    expect(html).toContain('If the button does not work');
    expect(text).toBe('Hi Asha,\n\nFirst.\n\nSecond.\n\nGo:\nhttps://example.org/x?token=abc\n\nIgnore if not you.');
  });

  it('escapes everything, so a name or message cannot add markup', () => {
    const { html } = renderEmail({ title: '<b>T</b>', greeting: 'Hi <img src=x onerror=alert(1)>,', paragraphs: ['"quoted" & <script>alert(1)</script>'], footer: "it's <i>fine</i>" });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>T</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp;');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('only turns an http(s) address into a button', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', '', undefined]) {
      const { html, text } = renderEmail({ title: 'T', button: { label: 'Go', url } });
      expect(html).not.toContain('<a href');
      expect(text).not.toContain('Go:');
    }
    expect(renderEmail({ title: 'T', button: { label: 'Go', url: 'HTTP://example.org' } }).html).toContain('<a href=');
  });

  it('works with nothing but a title', () => {
    const { html, text } = renderEmail({ title: 'Only a title' });
    expect(html).toContain('Only a title');
    expect(text).toBe('');
  });
});

describe('the emails the platform sends', () => {
  it('verification mail has both versions, the person\'s name escaped, and the link in both', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Asha <b>Rao</b>', email: 'asha@test.local', password: 'Str0ng!Passw0rd', role: 'user' });
    const mail = mailer.outbox.find((m) => m.to === 'asha@test.local');
    expect(mail.subject).toMatch(/^\d{6} is your E-Waste Network verification code$/);
    const code = /^(\d{6})/.exec(mail.subject)[1];
    expect(mail.html).toContain(code);
    expect(mail.text).toContain(`Your code: ${code}`);
    expect(mail.html).toContain('Or confirm with one click');
    expect(mail.html).not.toContain('<b>Rao</b>');
    const link = /https?:\/\/[^\s"<]+verify-email\?token=[\w-]+/.exec(mail.text)[0];
    expect(mail.html).toContain(link);
    expect(mail.text).toContain('valid for 15 minutes');
  });

  it('reset mail has both versions and says the link is single-use', async () => {
    await makeUser('user', { email: 'ravi@test.local' });
    await request(app).post('/api/auth/forgot-password').send({ email: 'ravi@test.local' });
    const mail = mailer.outbox.find((m) => m.to === 'ravi@test.local');
    expect(mail.subject).toBe('Reset your password - E-Waste Network');
    expect(mail.html).toContain('Choose a new password');
    expect(mail.text).toMatch(/reset-password\?token=[\w-]+/);
    expect(mail.text).toContain('can be used once');
  });

  it('a message without HTML is still sent as before (the contact form)', async () => {
    await request(app).post('/api/contact').send({ name: 'Visitor', email: 'v@test.local', subject: 'Hello there', message: 'A message long enough to be accepted.' });
    const mail = mailer.outbox[0];
    expect(mail).toBeDefined();
    expect(mail.html).toBeUndefined();
  });
});