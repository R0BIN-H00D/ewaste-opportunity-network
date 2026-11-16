import { z } from 'zod';
import { CONDITIONS, PICKUPS, SERVICES } from './devices';

const thisYear = new Date().getFullYear();
const oneOf = (pairs, message, allowEmpty = false) =>
  z.string().refine((v) => (allowEmpty && v === '') || pairs.some(([k]) => k === v), message);

// Mirrors backend/src/validators/device.validators.js. Form fields stay strings; toDevicePayload() cleans them up.
export const deviceSchema = z.object({
  name: z.string().trim().min(2, 'Enter the device name (at least 2 characters)').max(120, 'Keep the name under 120 characters'),
  category: z.string().min(1, 'Choose a category'),
  brand: z.string().trim().max(60, 'Keep the brand under 60 characters'),
  model: z.string().trim().max(60, 'Keep the model under 60 characters'),
  purchaseYear: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= 1990 && Number(v) <= thisYear + 1), `Enter a year between 1990 and ${thisYear + 1}`),
  description: z.string().trim().max(2000, 'Keep the description under 2000 characters'),
  condition: oneOf(CONDITIONS, 'Choose the condition'),
  preferredService: oneOf(SERVICES, 'Choose what should happen to this device'),
  expectedPrice: z.string().trim().refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0), 'Enter a price of 0 or more'),
  pickupPreference: oneOf(PICKUPS, 'Choose a handover option', true),
  addressArea: z.string().trim().max(100, 'Keep the area under 100 characters'),
  city: z.string().trim().max(80, 'Keep the city under 80 characters'),
});

export const EMPTY_VALUES = {
  name: '', category: '', brand: '', model: '', purchaseYear: '', description: '',
  condition: '', preferredService: '', expectedPrice: '', pickupPreference: '', addressArea: '', city: '',
};

export const STEP_FIELDS = {
  details: ['name', 'category', 'brand', 'model', 'purchaseYear', 'description'],
  photos: ['condition'],
  service: ['preferredService', 'expectedPrice', 'pickupPreference', 'addressArea', 'city'],
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
    out[key] = v;
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
    purchaseYear: s(listing.device?.purchaseYear),
    description: s(listing.description),
    condition: s(listing.condition),
    preferredService: s(listing.preferredService),
    expectedPrice: s(listing.expectedPrice),
    pickupPreference: s(listing.pickupPreference),
    addressArea: s(listing.addressArea),
    city: s(listing.city),
  };
}
