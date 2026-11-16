import { CONDITIONS, formatPrice, labelOf, photosOf, placeLabel } from '../lib/devices';
import { EMPTY_VALUES, deviceSchema, listingToValues, toDevicePayload } from '../lib/deviceSchema';
import { friendlyMessage, toApiError } from '../utils/errors';

const valid = { ...EMPTY_VALUES, name: 'Old laptop', category: 'laptops', condition: 'fully_working', preferredService: 'reuse' };
const problems = (values) => {
  const r = deviceSchema.safeParse(values);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
};

describe('device helpers', () => {
  it('formats prices for Indian rupees, free and on-request', () => {
    expect(formatPrice(undefined)).toBe('Price on request');
    expect(formatPrice('')).toBe('Price on request');
    expect(formatPrice(0)).toBe('Free');
    expect(formatPrice(1500)).toContain('1,500');
  });

  it('looks up labels and falls back to the raw value', () => {
    expect(labelOf(CONDITIONS, 'not_working')).toBe('Not working');
    expect(labelOf(CONDITIONS, 'mystery')).toBe('mystery');
    expect(labelOf(CONDITIONS, undefined)).toBe('');
  });

  it('builds a place label and reads photos safely', () => {
    expect(placeLabel({ addressArea: 'Indiranagar', city: 'Bengaluru' })).toBe('Indiranagar, Bengaluru');
    expect(placeLabel({ city: 'Pune' })).toBe('Pune');
    expect(placeLabel(null)).toBe('');
    expect(photosOf({ device: { photos: [{ url: '/a.jpg' }] } })).toHaveLength(1);
    expect(photosOf({})).toEqual([]);
  });
});

describe('deviceSchema', () => {
  it('accepts a minimal valid listing', () => {
    expect(problems(valid)).toEqual({});
  });

  it('requires a name, category, condition and service', () => {
    const p = problems(EMPTY_VALUES);
    expect(p.name).toMatch(/device name/i);
    expect(p.category).toBe('Choose a category');
    expect(p.condition).toBe('Choose the condition');
    expect(p.preferredService).toMatch(/what should happen/i);
  });

  it('rejects unknown choices and bad numbers', () => {
    expect(problems({ ...valid, condition: 'shiny' }).condition).toBeDefined();
    expect(problems({ ...valid, expectedPrice: '-5' }).expectedPrice).toMatch(/0 or more/);
    expect(problems({ ...valid, expectedPrice: 'abc' }).expectedPrice).toBeDefined();
    expect(problems({ ...valid, purchaseYear: '1800' }).purchaseYear).toMatch(/year between/);
    expect(problems({ ...valid, purchaseYear: '20' }).purchaseYear).toBeDefined();
  });

  it('allows empty optional fields, a free price and a valid year', () => {
    expect(problems({ ...valid, expectedPrice: '0', purchaseYear: '2019', pickupPreference: '' })).toEqual({});
  });

  it('enforces length limits', () => {
    expect(problems({ ...valid, name: 'x'.repeat(121) }).name).toBeDefined();
    expect(problems({ ...valid, description: 'x'.repeat(2001) }).description).toBeDefined();
  });
});

describe('toDevicePayload / listingToValues', () => {
  it('drops empty strings, trims values and adds status and coordinates', () => {
    const payload = toDevicePayload({ ...valid, name: '  Old laptop  ', brand: '' }, { coords: { lat: 12.9, lng: 77.6 }, status: 'draft' });
    expect(payload).toEqual({ name: 'Old laptop', category: 'laptops', condition: 'fully_working', preferredService: 'reuse', lat: 12.9, lng: 77.6, status: 'draft' });
    expect(payload).not.toHaveProperty('brand');
  });

  it('turns a stored listing into form strings', () => {
    const values = listingToValues({
      title: 'Phone', category: { slug: 'phones' }, brand: 'Acme', condition: 'minor_damage', preferredService: 'repair',
      expectedPrice: 0, device: { purchaseYear: 2020 },
    });
    expect(values).toMatchObject({ name: 'Phone', category: 'phones', brand: 'Acme', purchaseYear: '2020', expectedPrice: '0', model: '' });
  });
});

describe('error helpers', () => {
  it('maps API errors to messages and field errors', () => {
    const err = { response: { status: 422, data: { message: 'Validation failed', code: 'VALIDATION_ERROR', errors: [{ field: 'body.name', message: 'Name is too short' }] } } };
    const api = toApiError(err);
    expect(api.status).toBe(422);
    expect(api.fieldErrors).toEqual({ name: 'Name is too short' });
    expect(friendlyMessage(api)).toBe('Name is too short');
  });

  it('describes network failures', () => {
    expect(toApiError({ request: {} }).message).toMatch(/cannot reach the server/i);
  });

  it('keeps ordinary messages as they are', () => {
    expect(friendlyMessage({ code: 'NOT_FOUND', message: 'Listing not found', fieldErrors: {} })).toBe('Listing not found');
  });
});
