'use strict';
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { sendMail } = require('../services/integrations/mailer');
const { ok } = require('../utils/response');

/** Public contact form: delivered to SUPPORT_EMAIL with the sender as reply-to. Nothing is stored. */
exports.send = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;
  await sendMail({
    to: env.SUPPORT_EMAIL,
    replyTo: email,
    subject: `[Contact] ${subject}`,
    text: `From: ${name} <${email}>\n\n${message}`,
  });
  ok(res, { received: true }, 'Thanks for reaching out. We will reply by email.');
});
