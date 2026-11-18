import { z } from 'zod';
import { CONDITIONS, PICKUPS, SERVICES } from './devices';

const thisYear = new Date().getFullYear();

/** An Indian mobile number as 10 digits: spaces, dashes, brackets, +91, 91 and a leading 0 are dropped. */
export function normalizePhone(value) {
  let d = String(value || '').replace(/[\s\-().]/g, '');
  if (/^\+91\d{10}$/.test(d)) d = d.slice(3);
  else if (/^91\d{10}$/.test(d)) d = d.slice(2);
  else if (/^0\d{10}$/.test(d)) d = d.slice(1);
  return d;
}
const oneOf = (pairs, message, allowEmpty = false) =>
  z.string().refine((v) => (allowEmpty && v === '') || pairs.some(([k]) => k === v), message);

// Mirrors backend/src/validators/device.validators.js. Form fields stay strings; toDevicePayload() cleans them up.
const baseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Enter the device name (at least 3 characters)')
    .max(120, 'Keep the name under 120 characters')
    .regex(/[A-Za-z]/, 'The name must contain letters'),
  category: z.string().min(1, 'Choose a category'),
  brand: z.string().trim().min(2, 'Enter the brand (at least 2 characters)').max(60, 'Keep the brand under 60 characters'),
  model: z
    .string()
    .trim()
    .min(1, 'Enter the model, for example "Inspiron 15"')
    .max(60, 'Keep the model under 60 characters')
    .regex(/[A-Za-z0-9]/, 'The model must contain letters or numbers'),
  modelYear: z
    .string()
    .trim()
    .min(1, 'Enter the model year')
    .refine((v) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= 1990 && Number(v) <= thisYear), `Enter a year between 1990 and ${thisYear}`),
  purchaseYear: z
    .string()
    .trim()
    .min(1, 'Enter the year it was bought')
    .refine((v) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= 1990 && Number(v) <= thisYear), `Enter a year between 1990 and ${thisYear}`),
  description: z.string().trim().max(2000, 'Keep the description under 2000 characters'),
  condition: oneOf(CONDITIONS, 'Choose the condition'),
  preferredService: oneOf(SERVICES, 'Choose what should happen to this device'),
  expectedPrice: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0), 'Enter a price of 0 or more, with at most 2 decimals')
    .refine((v) => v === '' || Number(v) <= 10000000, 'That price is too high'),
  pickupPreference: oneOf(PICKUPS, 'Choose a handover option'),
  addressArea: z
    .string()
    .trim()
    .min(3, 'Enter the area or locality (at least 3 characters)')
    .max(100, 'Keep the area under 100 characters')
    .regex(/^[A-Za-z][A-Za-z0-9 .,'()/&-]*$/, 'The area must start with a letter and use normal characters'),
  agentPhone: z
    .string()
    .trim()
    .refine((v) => /^[6-9]\d{9}$/.test(normalizePhone(v)), 'Enter a valid 10-digit mobile number'),
  city: z
    .string()
    .trim()
    .min(2, 'Enter the city')
    .max(80, 'Keep the city under 80 characters')
    .regex(/^[A-Za-z][A-Za-z .'-]*$/, 'The city can only have letters'),
});

// The device cannot have been bought before its model came out.
export const deviceSchema = baseSchema.superRefine((v, ctx) => {
  const model = Number(v.modelYear);
  const bought = Number(v.purchaseYear);
  if (/^\d{4}$/.test(v.modelYear) && /^\d{4}$/.test(v.purchaseYear) && bought < model) {
    ctx.addIssue({ code: 'custom', path: ['purchaseYear'], message: `The purchase year cannot be earlier than the model year (${model})` });
  }
});

export const EMPTY_VALUES = {
  name: '', category: '', brand: '', model: '', modelYear: '', purchaseYear: '', description: '',
  condition: '', preferredService: '', expectedPrice: '', pickupPreference: '', addressArea: '', agentPhone: '', city: '',
};

export const STEP_FIELDS = {
  details: ['name', 'category', 'brand', 'model', 'modelYear', 'purchaseYear', 'description'],
  photos: ['condition'],
  service: ['preferredService', 'expectedPrice', 'pickupPreference', 'addressArea', 'city', 'agentPhone'],
};

export const CHECKLIST = [
  'I have backed up anything I want to keep.',
  'I have signed out of all accounts (Google, Apple, Microsoft…) and removed locks.',
  'I will erase personal data, or I understand the recipient may recover whatever is left on the device.',
];

/** Form strings -> API fields. Empty strings are left out (the API treats missing as "no value"). */
export function toDevicePayload(values, { coords, status } = {}) {
  const out = {};
  for (const [key, raw] of Object.entries(values)) {
    const v = typeof raw === 'string' ? raw.trim() : raw;
    if (v === '' || v === undefined) continue;
    out[key] = key === 'agentPhone' ? normalizePhone(v) : v;
  }
  if (coords) {
    out.lat = coords.lat;
    out.lng = coords.lng;
  }
  if (status) out.status = status;
  return out;
}

/** An existing listing -> form values. */
export function listingToValues(listing) {
  const s = (v) => (v === undefined || v === null ? '' : String(v));
  return {
    name: s(listing.title),
    category: s(listing.category?.slug),
    brand: s(listing.brand),
    model: s(listing.model),
    modelYear: s(listing.device?.modelYear),
    purchaseYear: s(listing.device?.purchaseYear),
    description: s(listing.description),
    condition: s(listing.condition),
    preferredService: s(listing.preferredService),
    expectedPrice: s(listing.expectedPrice),
    pickupPreference: s(listing.pickupPreference),
    addressArea: s(listing.addressArea),
    agentPhone: s(listing.agentPhone),
    city: s(listing.city),
  };
}
