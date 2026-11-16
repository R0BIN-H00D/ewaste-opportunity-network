'use strict';
// Email via SMTP (Nodemailer). With no SMTP_HOST configured the message is printed to the log instead,
// so the full auth flow (verify / reset links) works in development with zero setup.
// A mail failure never fails the request that triggered it.
const nodemailer = require('nodemailer');
const env = require('../../config/env');
const logger = require('../../utils/logger');

const outbox = []; // inspected by tests only (NODE_ENV=test)
let transport;

function getTransport() {
  if (!env.SMTP_HOST) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

async function sendMail({ to, subject, text, replyTo }) {
  const message = { from: env.MAIL_FROM, to, subject, text, ...(replyTo ? { replyTo } : {}) };
  if (env.isTest) {
    outbox.push(message);
    return { delivered: 'outbox' };
  }
  const t = getTransport();
  if (!t) {
    if (env.isProd) logger.warn({ to, subject }, 'SMTP is not configured; email was not sent');
    else logger.info({ to, subject, text }, 'SMTP not configured: email printed instead of sent');
    return { delivered: 'console' };
  }
  try {
    await t.sendMail(message);
    return { delivered: 'smtp' };
  } catch (err) {
    logger.error({ err: err.message, to, subject }, 'Failed to send email');
    return { delivered: 'failed' };
  }
}

module.exports = { sendMail, outbox };
