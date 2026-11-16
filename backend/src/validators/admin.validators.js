'use strict';
const { z, objectId, blankToUndefined, pageQuery } = require('./common');
const { ROLES, ACCOUNT_STATUS, VERIFICATION_STATUS, LISTING_STATUS } = require('../config/constants');

const userListQuery = z
  .object({
    ...pageQuery,
    q: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
    role: z.preprocess(blankToUndefined, z.enum(Object.values(ROLES)).optional()),
    status: z.preprocess(blankToUndefined, z.enum(Object.values(ACCOUNT_STATUS)).optional()),
  })
  .strict();

// Only these two moves are offered to an administrator; deleting an account is the owner's own action.
const userStatusBody = z
  .object({
    status: z.enum(['suspended', 'active']),
    reason: z.preprocess(blankToUndefined, z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500).optional()),
  })
  .strict()
  .refine((b) => b.status !== 'suspended' || b.reason, { path: ['reason'], message: 'A reason is required to suspend an account' });

const verificationListQuery = z
  .object({
    ...pageQuery,
    type: z.preprocess(blankToUndefined, z.enum(['provider', 'recipient']).optional()),
    status: z.preprocess(blankToUndefined, z.enum([...VERIFICATION_STATUS.filter((s) => s !== 'not_submitted'), 'all']).optional()),
    role: z.preprocess(blankToUndefined, z.enum(['technician', 'student', 'refurbisher', 'recycler']).optional()),
  })
  .strict();

const verificationTypeQuery = z.object({ type: z.preprocess(blankToUndefined, z.enum(['provider', 'recipient']).optional()) }).strict();

const verificationDecisionBody = z
  .object({
    type: z.enum(['provider', 'recipient']).optional(),
    decision: z.enum(['approved', 'rejected', 'resubmission_required']),
    reason: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  })
  .strict();

const day = z.preprocess(blankToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the form YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(v)), 'Not a real date').optional());
// The set of allowed statuses depends on the list, so the service checks `status`; the shape is checked here.
const monitorQuery = z
  .object({
    ...pageQuery,
    status: z.preprocess(blankToUndefined, z.string().trim().max(40).optional()),
    from: day,
    to: day,
  })
  .strict();

// ---- moderation (listings, reviews, reports) and categories ----
const optReason = z.preprocess(blankToUndefined, z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500).optional());
const optEnum = (values) => z.preprocess(blankToUndefined, z.enum(values).optional());

const listingListQuery = z
  .object({
    ...pageQuery,
    q: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
    status: optEnum(LISTING_STATUS),
    category: z.preprocess(blankToUndefined, objectId.optional()),
    reported: optEnum(['true']),
  })
  .strict();

const listingModerationBody = z
  .object({ action: z.enum(['remove', 'restore']), reason: optReason })
  .strict()
  .refine((b) => b.action !== 'remove' || b.reason, { path: ['reason'], message: 'A reason is required to remove a listing' });

const reviewListQuery = z
  .object({
    ...pageQuery,
    status: optEnum(['visible', 'hidden', 'removed']),
    reported: optEnum(['true']),
    rating: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(5).optional()),
  })
  .strict();

const reviewStatusBody = z
  .object({ status: z.enum(['visible', 'hidden', 'removed']), reason: optReason })
  .strict()
  .refine((b) => b.status === 'visible' || b.reason, { path: ['reason'], message: 'A reason is required to hide or remove a review' });

const reportListQuery = z
  .object({
    ...pageQuery,
    status: optEnum(['open', 'actioned', 'dismissed', 'all']),
    targetType: optEnum(['listing', 'review', 'product', 'user']),
    reason: optEnum(['spam', 'inappropriate', 'fraud', 'unsafe', 'wrong_category', 'other']),
  })
  .strict();

const reportDecisionBody = z
  .object({ decision: z.enum(['take_down', 'resolve', 'dismiss']), reason: optReason })
  .strict();

const categoryFields = {
  name: z.string().trim().min(2, 'Use at least 2 characters').max(60),
  icon: z.string().trim().regex(/^[a-z0-9-]{1,40}$/, 'Use a Lucide icon name such as "laptop"'),
  group: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(40)),
  hazardous: z.boolean(),
  active: z.boolean(),
};
const categoryCreateBody = z
  .object({ name: categoryFields.name, icon: categoryFields.icon.optional(), group: categoryFields.group.optional(), hazardous: categoryFields.hazardous.optional(), active: categoryFields.active.optional() })
  .strict();
const categoryUpdateBody = z
  .object({ name: categoryFields.name.optional(), icon: categoryFields.icon.optional(), group: categoryFields.group.optional(), hazardous: categoryFields.hazardous.optional(), active: categoryFields.active.optional() })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' });
const categoryOrderBody = z
  .object({ ids: z.array(objectId).min(1).max(200).refine((a) => new Set(a).size === a.length, 'Each category once') })
  .strict();

// ---- complaints, announcements, audit log ----
const complaintListQuery = z
  .object({
    ...pageQuery,
    status: optEnum(['active', 'closed', 'open', 'assigned', 'in_review', 'resolved', 'rejected', 'all']),
    assigned: optEnum(['me', 'unassigned']),
  })
  .strict();

const complaintActionBody = z
  .object({
    action: z.enum(['assign', 'start_review', 'resolve', 'reject']),
    note: z.preprocess(blankToUndefined, z.string().trim().min(5, 'Write at least 5 characters').max(1000).optional()),
    assignee: z.preprocess(blankToUndefined, objectId.optional()),
  })
  .strict()
  .refine((b) => (b.action !== 'resolve' && b.action !== 'reject') || b.note, { path: ['note'], message: 'Write the outcome, so the person who filed it can read it' });

const AUDIENCES = [...Object.values(ROLES), 'all'];
const announcementFields = {
  title: z.string().trim().min(3, 'Use at least 3 characters').max(140),
  body: z.string().trim().min(5, 'Use at least 5 characters').max(2000),
  audience: z.array(z.enum(AUDIENCES)).min(1, 'Choose who should see it').max(AUDIENCES.length),
  startsAt: z.preprocess(blankToUndefined, z.coerce.date({ invalid_type_error: 'Not a valid date and time' })),
};
const optDate = z.preprocess(blankToUndefined, z.coerce.date({ invalid_type_error: 'Not a valid date and time' }).optional());
const announcementCreateBody = z
  .object({ title: announcementFields.title, body: announcementFields.body, audience: announcementFields.audience.optional(), startsAt: optDate, endsAt: optDate })
  .strict();
const announcementUpdateBody = z
  .object({
    title: announcementFields.title.optional(),
    body: announcementFields.body.optional(),
    audience: announcementFields.audience.optional(),
    startsAt: optDate,
    endsAt: z.preprocess((v) => (v === '' ? null : v), z.union([z.null(), z.coerce.date({ invalid_type_error: 'Not a valid date and time' })]).optional()),
  })
  .strict();
const announcementListQuery = z.object({ ...pageQuery, state: optEnum(['current', 'scheduled', 'ended']) }).strict();

const auditListQuery = z
  .object({
    ...pageQuery,
    admin: z.preprocess(blankToUndefined, objectId.optional()),
    action: z.preprocess(blankToUndefined, z.string().trim().regex(/^[a-z_.]{1,60}$/, 'Not a known action').optional()),
    targetType: z.preprocess(blankToUndefined, z.string().trim().regex(/^[A-Za-z]{1,40}$/, 'Not a known kind').optional()),
    from: day,
    to: day,
  })
  .strict();

// ---- analytics, exports, certificates ----
const analyticsQuery = z.object({ months: z.preprocess(blankToUndefined, z.coerce.number().int().min(3, 'Choose 3 to 24 months').max(24, 'Choose 3 to 24 months').optional()) }).strict();

// One shape for every export; which filters a given export accepts is checked by the service, which refuses the rest.
const exportQuery = z
  .object({
    status: z.preprocess(blankToUndefined, z.string().trim().max(40).optional()),
    role: optEnum(Object.values(ROLES)),
    category: z.preprocess(blankToUndefined, objectId.optional()),
    from: day,
    to: day,
  })
  .strict();

const certificateListQuery = z.object({ ...pageQuery, state: optEnum(['waiting', 'issued', 'all']) }).strict();
const certificateIssueBody = z.object({ applicationId: objectId }).strict();

module.exports = {
  analyticsQuery, exportQuery, certificateListQuery, certificateIssueBody,
  listingListQuery, listingModerationBody, reviewListQuery, reviewStatusBody, reportListQuery, reportDecisionBody,
  categoryCreateBody, categoryUpdateBody, categoryOrderBody,
  complaintListQuery, complaintActionBody, announcementCreateBody, announcementUpdateBody, announcementListQuery, auditListQuery,
  userListQuery, userStatusBody, verificationListQuery, verificationTypeQuery, verificationDecisionBody, monitorQuery,
};
