import { CONDITIONS, formatPrice, labelOf, photosOf, placeLabel } from '../lib/devices';
import { EMPTY_VALUES, deviceSchema, listingToValues, toDevicePayload } from '../lib/deviceSchema';
import { friendlyMessage, toApiError } from '../utils/errors';

const valid = {
  ...EMPTY_VALUES, name: 'Old laptop', category: 'laptops', brand: 'Dell', model: 'Inspiron 15', modelYear: '2018', purchaseYear: '2019', description: 'Slow, the fan is loud.', condition: 'fully_working',
  preferredService: 'repair', pickupPreference: 'pickup', addressArea: 'Indiranagar', city: 'Bengaluru', agentPhone: '98765 43210',
};
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

  it('requires the details, condition, service and place', () => {
    const p = problems(EMPTY_VALUES);
    expect(p.name).toBeDefined();
    expect(problems({ ...valid, name: '12345' }).name).toMatch(/letters/);
    expect(p.category).toBe('Choose a category');
    expect(p.condition).toBe('Choose the condition');
    expect(p.preferredService).toMatch(/what should happen/i);
    expect(p.brand).toMatch(/brand/i);
    expect(p.model).toMatch(/model/i);
    expect(p.modelYear).toBeDefined();
    expect(p.purchaseYear).toBeDefined();
    expect(p.pickupPreference).toMatch(/handover/i);
    expect(p.addressArea).toBeDefined();
    expect(p.city).toBeDefined();
    expect(p.agentPhone).toBeDefined();
  });

  it('checks names, places and prices properly', () => {
    expect(problems({ ...valid, name: 'ab' }).name).toBeDefined();
    expect(problems({ ...valid, model: '###' }).model).toMatch(/letters or numbers/);
    expect(problems({ ...valid, purchaseYear: '' }).purchaseYear).toBeDefined();
    expect(problems({ ...valid, purchaseYear: '19' }).purchaseYear).toBeDefined();
    expect(problems({ ...valid, modelYear: '' }).modelYear).toBeDefined();
    expect(problems({ ...valid, modelYear: '18' }).modelYear).toBeDefined();
    expect(problems({ ...valid, modelYear: '2020', purchaseYear: '2019' }).purchaseYear).toMatch(/cannot be earlier than the model year \(2020\)/);
    expect(problems({ ...valid, modelYear: '2019', purchaseYear: '2019' })).toEqual({});
    expect(problems({ ...valid, modelYear: '2018', purchaseYear: '2022' })).toEqual({});
    expect(problems({ ...valid, description: '' })).toEqual({});
    expect(problems({ ...valid, description: 'ok' })).toEqual({});
    expect(problems({ ...valid, addressArea: '12' }).addressArea).toBeDefined();
    expect(problems({ ...valid, addressArea: '### road' }).addressArea).toBeDefined();
    expect(problems({ ...valid, city: '560038' }).city).toMatch(/letters/);
    expect(problems({ ...valid, agentPhone: '' }).agentPhone).toMatch(/10-digit/);
    expect(problems({ ...valid, agentPhone: '12345' }).agentPhone).toBeDefined();
    expect(problems({ ...valid, agentPhone: '5876543210' }).agentPhone).toBeDefined();
    expect(problems({ ...valid, agentPhone: '+91 98765-43210' })).toEqual({});
    expect(problems({ ...valid, agentPhone: '09876543210' })).toEqual({});
    expect(problems({ ...valid, expectedPrice: '12.345' }).expectedPrice).toMatch(/2 decimals/);
    expect(problems({ ...valid, expectedPrice: '99999999' }).expectedPrice).toMatch(/too high/);
    expect(problems({ ...valid, purchaseYear: String(new Date().getFullYear() + 1) }).purchaseYear).toBeDefined();
    expect(problems({ ...valid, expectedPrice: '1500.50' })).toEqual({});
  });

  it('rejects unknown choices and bad numbers', () => {
    expect(problems({ ...valid, condition: 'shiny' }).condition).toBeDefined();
    expect(problems({ ...valid, expectedPrice: '-5' }).expectedPrice).toMatch(/0 or more/);
    expect(problems({ ...valid, expectedPrice: 'abc' }).expectedPrice).toBeDefined();
    expect(problems({ ...valid, modelYear: '2000', purchaseYear: '1800' }).purchaseYear).toBeDefined();
    expect(problems({ ...valid, purchaseYear: '20' }).purchaseYear).toBeDefined();
  });

  it('allows an empty description and price, a free price and a valid year', () => {
    expect(problems({ ...valid, description: '', expectedPrice: '' })).toEqual({});
    expect(problems({ ...valid, expectedPrice: '0', purchaseYear: '2019' })).toEqual({});
  });

  it('enforces length limits', () => {
    expect(problems({ ...valid, name: 'x'.repeat(121) }).name).toBeDefined();
    expect(problems({ ...valid, description: 'x'.repeat(2001) }).description).toBeDefined();
  });
});

describe('toDevicePayload / listingToValues', () => {
  it('drops empty strings, trims values and adds status and coordinates', () => {
    const payload = toDevicePayload({ ...valid, name: '  Old laptop  ', brand: '' }, { coords: { lat: 12.9, lng: 77.6 }, status: 'draft' });
    expect(payload).toMatchObject({ name: 'Old laptop', category: 'laptops', condition: 'fully_working', preferredService: 'repair', lat: 12.9, lng: 77.6, status: 'draft' });
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
