'use strict';
const { z, objectId } = require('./common');
const { ROLES } = require('../config/constants');

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict();
const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,15}$/, 'Enter a valid phone number');
const str = (max) => z.string().trim().max(max);
const ids = (max = 20) => z.array(objectId).max(max);
const nonEmpty = (o) => Object.keys(o).length > 0;
const NON_EMPTY = { message: 'Provide at least one field to update' };

const updateUserBody = z
  .object({ name: z.string().trim().min(2).max(80).optional(), phone: phone.nullable().optional() })
  .strict()
  .refine(nonEmpty, NON_EMPTY);

const updateProfileBody = z
  .object({
    bio: str(500).optional(),
    addressLine: str(200).optional(),
    addressArea: str(100).optional(),
    city: str(80).optional(),
    state: str(80).optional(),
    pincode: str(12).optional(),
    location: latLng.nullable().optional(),
    // `recipientVerification` is deliberately absent: only admins can change it.
    orgProfile: z
      .object({
        isOrg: z.boolean(),
        orgType: z.enum(['school', 'college', 'ngo', 'trust', 'company', 'other']),
        orgName: str(150),
        registrationNo: str(60),
      })
      .partial()
      .strict()
      .optional(),
    preferences: z
      .object({ emailNotifications: z.boolean(), pushNotifications: z.boolean(), theme: z.enum(['light', 'dark', 'system']) })
      .partial()
      .strict()
      .optional(),
  })
  .strict()
  .refine(nonEmpty, NON_EMPTY);

/* Role profiles. verification/rating/earnings fields are server-controlled and therefore not accepted. */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const technician = z
  .object({
    headline: str(120),
    experienceYears: z.number().int().min(0).max(60),
    qualifications: z.array(z.object({ title: str(120), institution: str(120).optional(), year: z.number().int().min(1950).max(2100).optional() }).strict()).max(10),
    specializations: z.array(str(60)).max(20),
    deviceCategories: ids(),
    serviceLocation: latLng.nullable(),
    serviceAddressArea: str(100),
    city: str(80),
    serviceRadiusKm: z.number().min(1).max(200),
    baseRate: z.number().min(0).max(1000000),
    availability: z
      .object({
        status: z.enum(['available', 'limited', 'unavailable']),
        weekly: z.array(z.object({ day: z.number().int().min(0).max(6), from: hhmm, to: hhmm }).strict()).max(14),
      })
      .partial()
      .strict(),
  })
  .partial()
  .strict();

const refurbisher = z
  .object({
    businessName: z.string().trim().min(2).max(150),
    registrationNo: str(60),
    description: str(1000),
    categories: ids(),
    addressArea: str(100),
    city: str(80),
    location: latLng.nullable(),
  })
  .partial()
  .strict();

const recycler = z
  .object({
    name: z.string().trim().min(2).max(150),
    authorizationNo: str(60),
    authorizingBody: str(150),
    validUntil: z.coerce.date().nullable(),
    facilityDetails: str(2000),
    acceptedCategories: ids(),
    operatingHours: str(200),
    city: str(80),
    location: latLng.nullable(),
  })
  .partial()
  .strict();

const ROLE_PROFILE_BODY = {
  [ROLES.TECHNICIAN]: technician,
  [ROLES.REFURBISHER]: refurbisher,
  [ROLES.RECYCLER]: recycler,
};

const deleteAccountBody = z.object({ password: z.string().min(1).max(200) }).strict();

module.exports = { updateUserBody, updateProfileBody, ROLE_PROFILE_BODY, deleteAccountBody, latLng, NON_EMPTY, nonEmpty };
