'use strict';
const request = require('supertest');
const mailer = require('../../src/services/integrations/mailer');

const MOBILE = { 'X-Client-Type': 'mobile' };
const PASSWORD = 'Passw0rd!x';
let n = 0;

const creds = (over = {}) => {
  n += 1;
  return { name: `Asha Rao ${n}`, email: `asha${n}@test.local`, password: PASSWORD, ...over };
};

/** Registers through the real endpoint. Mobile header => refresh token is returned in the body. */
async function signup(app, over = {}) {
  const body = creds(over);
  const res = await request(app).post('/api/auth/register').set(MOBILE).send(body);
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    body,
    email: body.email,
    id: res.body.data.user._id,
    token: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
    auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
  };
}

const login = (app, email, password = PASSWORD, headers = MOBILE) =>
  request(app).post('/api/auth/login').set(headers).send({ email, password });

/** Latest email to `to` whose text contains `path`; returns the token query parameter of its link. */
function tokenFromMail(to, path) {
  const mail = [...mailer.outbox].reverse().find((m) => m.to === to && m.text.includes(path));
  if (!mail) return null;
  return new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
}

module.exports = { MOBILE, PASSWORD, creds, signup, login, tokenFromMail, mailer };
