'use strict';
const { z, pageQuery } = require('./common');
const { CONDITIONS } = require('../config/constants');

const createBody = z
  .object({
    title: z.string().trim().min(3, 'Say what you are looking for').max(120),
    category: z.string().trim().min(1).max(60).optional(),
    brand: z.string().trim().max(60).optional(),
    minCondition: z.enum(CONDITIONS).optional(),
    quantity: z.number().int().min(1).max(1000).optional(),
    city: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

// Editing: every field is optional, and an empty value clears an optional field.
const updateBody = z
  .object({
    title: z.string().trim().min(3, 'Say what you are looking for').max(120).optional(),
    category: z.string().trim().max(60).nullable().optional(),
    brand: z.string().trim().max(60).nullable().optional(),
    minCondition: z.enum(CONDITIONS).or(z.literal('')).nullable().optional(),
    quantity: z.number().int().min(1).max(1000).optional(),
    city: z.string().trim().max(80).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

const listQuery = z.object({ ...pageQuery, as: z.enum(['mine', 'board', 'accepted']).optional(), status: z.enum(['open', 'closed']).optional() }).strict();
const statusBody = z.object({ status: z.enum(['open', 'closed']) }).strict();

const respondBody = z.object({ message: z.string().trim().max(1000).optional() }).strict();

module.exports = { createBody, updateBody, listQuery, statusBody, respondBody };
