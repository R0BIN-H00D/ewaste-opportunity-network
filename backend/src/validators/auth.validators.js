'use strict';
const { z, objectId } = require('./common');
const { SELF_REGISTER_ROLES, ROLES } = require('../config/constants');

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
// bcrypt only uses the first 72 bytes, so cap there.
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');
const token = z.string().min(20).max(200);

const registerBody = z
  .object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    email,
    password,
    role: z.enum(SELF_REGISTER_ROLES).default(ROLES.USER),
    phone: z.string().trim().regex(/^\+?[0-9\s-]{7,15}$/, 'Enter a valid phone number').optional(),
    organizationName: z.string().trim().min(2).max(150).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ([ROLES.REFURBISHER, ROLES.RECYCLER].includes(v.role) && !v.organizationName) {
      ctx.addIssue({ code: 'custom', path: ['organizationName'], message: 'Organization name is required for this role' });
    }
  });

const loginBody = z.object({ email, password: z.string().min(1).max(200) }).strict();
// Web sends the refresh token as an httpOnly cookie; mobile sends it in the body.
const refreshBody = z.object({ refreshToken: token.optional() }).strict();
const forgotBody = z.object({ email }).strict();
const resetBody = z.object({ token, password }).strict();
const verifyEmailBody = z.object({ token }).strict();
const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password }).strict();
const deleteAccountBody = z.object({ password: z.string().min(1).max(200) }).strict();
const sessionParam = z.object({ id: objectId }).strict();

module.exports = {
  registerBody, loginBody, refreshBody, forgotBody, resetBody, verifyEmailBody, changePasswordBody, deleteAccountBody, sessionParam, password,
};
