import { CONDITIONS, conditionRows, formatPrice, labelOf, midPrice, partsFor, priceRangeText, requiredPartsFor, photosOf, placeLabel, suggestCondition } from '../lib/devices';
import { EMPTY_VALUES, deviceEditSchema, deviceSchema, listingToValues, toDevicePayload } from '../lib/deviceSchema';
import { friendlyMessage, toApiError } from '../utils/errors';

const valid = {
  ...EMPTY_VALUES, name: 'Old laptop', category: 'laptops', brand: 'Dell', model: 'Inspiron 15', modelYear: '2018', purchaseYear: '2019', description: 'Slow, the fan is loud.', condition: 'fully_working', conditionDetails: { ...EMPTY_VALUES.conditionDetails, water: 'none', battery: 'holds_well', screen: 'no_damage', ports: 'all_work' },
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

  it('allows an empty price, a free price and a valid year', () => {
    expect(problems({ ...valid, expectedPrice: '' })).toEqual({});
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

describe('the condition of each part', () => {
  it('asks about the parts that fit the category', () => {
    const keys = (slug) => partsFor(slug).map((p) => p.key);
    expect(keys('smartphone')).toEqual(['power', 'screen', 'battery', 'body', 'charging', 'ports', 'sound', 'camera', 'water']);
    expect(keys('television')).toEqual(['power', 'screen', 'body', 'ports', 'sound', 'water']);
    expect(keys('keyboard')).toEqual(['body', 'ports', 'water']);
    expect(keys('battery')).toEqual(['battery', 'body']);
    expect(keys('something-new')).toEqual(['power', 'body', 'water']); // an unknown category still gets the basics
    expect(keys('')).toEqual(['power', 'body', 'water']);
  });

  it('needs battery, screen, ports and buttons and water damage, only where the category has them', () => {
    const keys = (slug) => requiredPartsFor(slug).map((p) => p.key);
    expect(keys('smartphone')).toEqual(['battery', 'screen', 'ports', 'water']);
    expect(keys('television')).toEqual(['screen', 'ports', 'water']);
    expect(keys('keyboard')).toEqual(['ports', 'water']);
    expect(keys('battery')).toEqual(['battery']);
    expect(keys('something-new')).toEqual(['water']);
    const empty = { ...EMPTY_VALUES.conditionDetails };
    const missing = (details, slug = 'smartphone') => {
      const r = deviceSchema.safeParse({ ...valid, category: slug, conditionDetails: { ...empty, ...details } });
      return r.success ? [] : r.error.issues.filter((i) => i.path[0] === 'conditionDetails').map((i) => i.path[1]);
    };
    expect(missing({})).toEqual(['battery', 'screen', 'ports', 'water']);
    expect(missing({ battery: 'holds_well', water: 'none' })).toEqual(['screen', 'ports']);
    expect(missing({ battery: 'holds_well', screen: 'no_damage', ports: 'all_work', water: 'none' })).toEqual([]);
    expect(missing({ ports: 'all_work', water: 'none' }, 'keyboard')).toEqual([]); // a keyboard has no battery or screen
    // an older listing can still be edited without them
    expect(deviceEditSchema.safeParse({ ...valid, category: 'smartphone', conditionDetails: { ...empty } }).success).toBe(true);
  });

  it('writes a price range in words and offers the middle', () => {
    expect(priceRangeText({ min: 8000, max: 12000 })).toBe('₹8,000 to ₹12,000');
    expect(priceRangeText(null)).toBe('');
    expect(midPrice({ min: 8000, max: 12000 })).toBe(10000);
    expect(midPrice({ min: 3040, max: 5120 })).toBe(4100);
    expect(midPrice(null)).toBeNull();
  });

  it('suggests an overall condition from the answers, and nothing from no answers', () => {
    expect(suggestCondition({})).toBe('');
    expect(suggestCondition({ battery: '', screen: '' })).toBe('');
    expect(suggestCondition({ power: 'works_normally', screen: 'no_damage', battery: 'holds_well' })).toBe('fully_working');
    expect(suggestCondition({ power: 'works_normally', battery: 'drains_fast' })).toBe('minor_damage');
    expect(suggestCondition({ screen: 'cracked', battery: 'holds_well' })).toBe('major_damage');
    expect(suggestCondition({ water: 'damaged' })).toBe('major_damage');
    expect(suggestCondition({ power: 'does_not_turn_on', screen: 'no_damage' })).toBe('not_working');
  });

  it('lists the answered parts with readable words, in the usual order', () => {
    expect(conditionRows({ battery: 'drains_fast', screen: 'cracked', camera: '' })).toEqual([['Screen', 'Cracked'], ['Battery', 'Drains quickly']]);
    expect(conditionRows(undefined)).toEqual([]);
  });

  it('sends only the answered parts that belong to the category, and clears them on an edit', () => {
    const details = { power: 'works_normally', screen: 'cracked', battery: '', body: '', charging: '', ports: '', sound: '', camera: '', water: '' };
    expect(toDevicePayload({ ...valid, category: 'smartphone', conditionDetails: details }).conditionDetails).toEqual({ power: 'works_normally', screen: 'cracked' });
    // a keyboard has no screen: an answer left over from another category is not sent
    expect(toDevicePayload({ ...valid, category: 'keyboard', conditionDetails: details }).conditionDetails).toBeUndefined();
    expect(toDevicePayload({ ...valid, category: 'keyboard', conditionDetails: details }, { editing: true }).conditionDetails).toEqual({});
    expect(toDevicePayload({ ...valid, category: 'smartphone', conditionDetails: { ...details, power: '', screen: '' } }).conditionDetails).toBeUndefined();
  });

  it('fills the form from a stored listing', () => {
    const values = listingToValues({ title: 'Phone', category: { slug: 'smartphone' }, condition: 'minor_damage', conditionDetails: { battery: 'drains_fast' } });
    expect(values.conditionDetails).toMatchObject({ battery: 'drains_fast', screen: '' });
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
