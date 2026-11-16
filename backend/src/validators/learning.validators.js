'use strict';
const { z, objectId, blankToUndefined, pageQuery } = require('./common');
const { APPLICATION_STATUS } = require('../config/constants');

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

const skills = z
  .array(z.string().trim().min(1, 'A skill cannot be empty').max(40))
  .max(10, 'At most 10 skills')
  .transform((list) => [...new Set(list.map((s) => s.toLowerCase()))]);

const future = (d) => d.getTime() > Date.now();

const createBody = z
  .object({
    title: z.string().trim().min(5, 'Give the task a clear title').max(140),
    description: z.string().trim().max(2000).optional(),
    deviceTypeId: objectId,
    requiredSkills: skills.optional(),
    difficulty: z.enum(DIFFICULTIES).optional(),
    locationArea: z.string().trim().min(2, 'Enter the area or locality').max(100),
    deadline: z.coerce.date().refine(future, { message: 'The deadline must be in the future' }),
    seats: z.coerce.number().int().min(1).max(20).optional(),
    expectedHours: z.coerce.number().min(1).max(200).optional(),
    // The technician agrees to supervise throughout and that no hazardous handling is included (BR-07).
    supervisionAcknowledged: z.literal(true, { errorMap: () => ({ message: 'Confirm that you will supervise and that no hazardous handling is involved' }) }),
  })
  .strict();

const updateBody = z
  .object({
    title: createBody.shape.title.optional(),
    description: z.string().trim().max(2000).optional(),
    deviceTypeId: objectId.optional(),
    requiredSkills: skills.optional(),
    difficulty: z.enum(DIFFICULTIES).optional(),
    locationArea: createBody.shape.locationArea.optional(),
    deadline: createBody.shape.deadline.optional(),
    seats: createBody.shape.seats,
    expectedHours: createBody.shape.expectedHours,
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' });

const statusBody = z.object({ status: z.enum(['open', 'closed']) }).strict();

const text = (max) => z.preprocess(blankToUndefined, z.string().trim().min(1).max(max).optional());

const listQuery = z
  .object({
    ...pageQuery,
    q: text(100),
    difficulty: z.preprocess(blankToUndefined, z.enum(DIFFICULTIES).optional()),
    category: text(60), // category slug
    skill: text(40),
  })
  .strict();

const mineQuery = z.object({ ...pageQuery, status: z.preprocess(blankToUndefined, z.enum(['open', 'closed', 'filled']).optional()) }).strict();

const applicantsQuery = z.object({ ...pageQuery, status: z.preprocess(blankToUndefined, z.enum(APPLICATION_STATUS).optional()) }).strict();

const applicationsQuery = z.object({ ...pageQuery, status: z.preprocess(blankToUndefined, z.enum(APPLICATION_STATUS).optional()) }).strict();

const applyBody = z.object({ opportunityId: objectId, message: z.string().trim().max(500).optional() }).strict();

const decisionBody = z.object({ decision: z.enum(['accepted', 'rejected']), feedback: z.string().trim().max(1000).optional() }).strict();

const completeBody = z
  .object({
    hours: z.coerce.number().min(0.5, 'Record at least half an hour').max(200, 'That is more than 200 hours'),
    feedback: z.string().trim().max(1000).optional(),
  })
  .strict();

const noteBody = z.object({ reason: z.string().trim().max(500).optional() }).strict();

module.exports = {
  DIFFICULTIES, createBody, updateBody, statusBody, listQuery, mineQuery, applicantsQuery, applicationsQuery, applyBody, decisionBody, completeBody, noteBody,
};
