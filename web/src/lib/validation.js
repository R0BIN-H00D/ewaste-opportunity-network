import { z } from 'zod';

// Mirrors backend/src/validators (the server is still the authority; this is for instant feedback).
export const email = z.string().trim().toLowerCase().min(1, 'Enter your email').email('Enter a valid email address');
export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');
const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,15}$/, 'Enter a valid phone number');
const optionalPhone = z.union([z.literal(''), phone]);

const confirmMatches = (key, confirmKey) => (v, ctx) => {
  if (v[key] !== v[confirmKey]) ctx.addIssue({ code: 'custom', path: [confirmKey], message: 'Passwords do not match' });
};

export const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password') });
export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({ password, confirmPassword: z.string().min(1, 'Confirm your password') })
  .superRefine(confirmMatches('password', 'confirmPassword'));

export const ROLE_OPTIONS = [
  { value: 'user', label: 'Individual', hint: 'Donate, sell or recycle my old devices' },
  { value: 'technician', label: 'Technician', hint: 'Offer repair services' },
  { value: 'refurbisher', label: 'Refurbisher', hint: 'Refurbish and resell devices' },
  { value: 'recycler', label: 'Recycling centre', hint: 'Responsibly recycle e-waste' },
];
export const NEEDS_ORG_NAME = ['refurbisher', 'recycler'];

export const registerSchema = z
  .object({
    role: z.enum(['user', 'technician', 'refurbisher', 'recycler']),
    name: z.string().trim().min(2, 'Enter your name').max(80),
    email,
    phone: optionalPhone,
    organizationName: z.string().trim().max(150),
    password,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .superRefine((v, ctx) => {
    confirmMatches('password', 'confirmPassword')(v, ctx);
    if (NEEDS_ORG_NAME.includes(v.role) && v.organizationName.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['organizationName'], message: 'Enter your organisation name' });
    }
  });

/** Body for POST /auth/register: drops empty optional fields and the confirmation. */
export function toRegisterBody(values) {
  const body = { role: values.role, name: values.name.trim(), email: values.email, password: values.password };
  if (values.phone) body.phone = values.phone.trim();
  if (NEEDS_ORG_NAME.includes(values.role)) body.organizationName = values.organizationName.trim();
  return body;
}

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: password, confirmPassword: z.string().min(1, 'Confirm the new password') })
  .superRefine(confirmMatches('newPassword', 'confirmPassword'));

export const accountSchema = z.object({ name: z.string().trim().min(2, 'Enter your name').max(80), phone: optionalPhone });
export const deleteAccountSchema = z.object({ password: z.string().min(1, 'Enter your password to confirm') });
