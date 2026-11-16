'use strict';
const { z } = require('./common');

const oneLine = (min, max, label) =>
  z.string().trim().min(min, `Enter ${label}`).max(max).transform((v) => v.replace(/\s+/g, ' '));

const contactBody = z
  .object({
    name: oneLine(2, 80, 'your name'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
    subject: oneLine(3, 120, 'a subject'),
    message: z.string().trim().min(10, 'Write at least 10 characters').max(2000, 'Keep the message under 2000 characters'),
  })
  .strict();

module.exports = { contactBody };
