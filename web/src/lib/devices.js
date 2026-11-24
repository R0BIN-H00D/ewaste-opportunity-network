// Labels and helpers for device listings. Values mirror backend/src/config/constants.js.
export const CONDITIONS = [
  ['fully_working', 'Fully working'],
  ['minor_damage', 'Minor damage'],
  ['major_damage', 'Major damage'],
  ['not_working', 'Not working'],
  ['for_spare_parts', 'For spare parts'],
];
// What a person can choose for a new listing. SERVICES (below) still has every label, so older listings read correctly.
export const LISTABLE_SERVICES = ['repair', 'refurbishment', 'recycling'];

export const SERVICES = [
  ['repair', 'Repair'],
  ['reuse', 'Reuse'],
  ['donation', 'Donation'],
  ['refurbishment', 'Refurbishment'],
  ['recycling', 'Recycling'],
];
export const PICKUPS = [
  ['pickup', 'Pickup from my place'],
  ['drop_off', 'I can drop it off'],
  ['either', 'Either works'],
];
export const SORTS = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
];
export const LISTING_STATUS = {
  draft: 'Draft',
  listed: 'Listed',
  in_service: 'In service',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
  removed_by_admin: 'Removed by admin',
};
export const REPORT_REASONS = [
  ['spam', 'Spam'],
  ['inappropriate', 'Inappropriate'],
  ['fraud', 'Fraud or scam'],
  ['unsafe', 'Unsafe item'],
  ['wrong_category', 'Wrong category'],
  ['other', 'Something else'],
];
export const MAX_PHOTOS = 6;

// How each part of a device is doing. All optional; the form shows only the parts that fit the category.
export const CONDITION_PARTS = [
  { key: 'power', label: 'Does it turn on?', options: [['works_normally', 'Turns on and works normally'], ['unstable', 'Turns on but is unstable (restarts or freezes)'], ['does_not_turn_on', 'Does not turn on']] },
  { key: 'screen', label: 'Screen', options: [['no_damage', 'No damage'], ['scratched', 'Light scratches'], ['cracked', 'Cracked'], ['faulty', 'Faulty (lines, spots or no picture)']] },
  { key: 'battery', label: 'Battery', options: [['holds_well', 'Holds charge well'], ['drains_fast', 'Drains quickly'], ['needs_replacing', 'Needs replacing'], ['swollen', 'Swollen or leaking'], ['missing', 'No battery']] },
  { key: 'body', label: 'Body and casing', options: [['like_new', 'Like new'], ['scratched_or_dented', 'Scratches or dents'], ['cracked_or_bent', 'Cracked or bent'], ['parts_missing', 'Parts missing']] },
  { key: 'charging', label: 'Charging', options: [['normal', 'Charges normally'], ['slow', 'Charges slowly'], ['not_charging', 'Does not charge'], ['port_damaged', 'Charging port damaged']] },
  { key: 'ports', label: 'Ports and buttons', options: [['all_work', 'All work'], ['some_faulty', 'Some do not work']] },
  { key: 'sound', label: 'Speaker and microphone', options: [['works', 'Works'], ['faulty', 'Faulty']] },
  { key: 'camera', label: 'Camera', options: [['works', 'Works'], ['faulty', 'Faulty']] },
  { key: 'water', label: 'Water damage', options: [['none', 'None'], ['suspected', 'Suspected'], ['damaged', 'Yes, water damaged']] },
];
const ALL_PARTS = CONDITION_PARTS.map((p) => p.key);
const PARTS_BY_CATEGORY = {
  laptop: ALL_PARTS, smartphone: ALL_PARTS, tablet: ALL_PARTS,
  'desktop-computer': ['power', 'body', 'ports', 'sound', 'water'],
  monitor: ['power', 'screen', 'body', 'ports', 'sound', 'water'],
  television: ['power', 'screen', 'body', 'ports', 'sound', 'water'],
  keyboard: ['body', 'ports', 'water'], mouse: ['body', 'ports', 'water'],
  printer: ['power', 'body', 'ports', 'water'], charger: ['power', 'body', 'ports'], battery: ['battery', 'body'],
};
const DEFAULT_PARTS = ['power', 'body', 'water'];
/** The parts worth asking about for a category slug. */
export const partsFor = (slug) => {
  const keys = PARTS_BY_CATEGORY[slug] || DEFAULT_PARTS;
  return CONDITION_PARTS.filter((p) => keys.includes(p.key));
};

// Answered before a device goes live (for the categories that have them); the rest sit behind "Show more".
export const REQUIRED_PARTS = ['battery', 'screen', 'ports', 'water'];
export const requiredPartsFor = (slug) => REQUIRED_PARTS.map((key) => partsFor(slug).find((p) => p.key === key)).filter(Boolean);

const SERIOUS = { power: ['unstable', 'does_not_turn_on'], screen: ['cracked', 'faulty'], battery: ['swollen'], body: ['cracked_or_bent', 'parts_missing'], charging: ['not_charging'], water: ['damaged'] };
const MINOR = { screen: ['scratched'], battery: ['drains_fast', 'needs_replacing', 'missing'], body: ['scratched_or_dented'], charging: ['slow', 'port_damaged'], ports: ['some_faulty'], sound: ['faulty'], camera: ['faulty'], water: ['suspected'] };
/** The overall condition that the answers point to, or '' when nothing was answered. Only ever a suggestion. */
export function suggestCondition(details) {
  const answers = Object.entries(details || {}).filter(([, v]) => v);
  if (answers.length === 0) return '';
  if (details.power === 'does_not_turn_on') return 'not_working';
  if (answers.some(([k, v]) => (SERIOUS[k] || []).includes(v))) return 'major_damage';
  if (answers.some(([k, v]) => (MINOR[k] || []).includes(v))) return 'minor_damage';
  return 'fully_working';
}

/** A rough price range as words: "₹8,000 to ₹12,000". */
export const priceRangeText = (range) => (range ? `${formatPrice(range.min)} to ${formatPrice(range.max)}` : '');
/** The middle of a range, rounded to the nearest 100, to offer as one price. */
export const midPrice = (range) => (range ? Math.round((range.min + range.max) / 2 / 100) * 100 : null);

// The same parts, worded for a buyer looking at a product.
const BUYER_LABELS = { power: 'Working condition', battery: 'Battery', screen: 'Screen', body: 'Scratches and body', charging: 'Charging', ports: 'Ports and buttons', sound: 'Speaker and microphone', camera: 'Camera', water: 'Water damage' };

/** How one answer reads: 'good', 'warn' (a minor issue) or 'bad' (needs attention). */
export function partTone(key, value) {
  if ((SERIOUS[key] || []).includes(value)) return 'bad';
  if ((MINOR[key] || []).includes(value)) return 'warn';
  return 'good';
}

/** One row for each answered part, in the usual order, for the "About this device" box. */
export const aboutRows = (details) => CONDITION_PARTS
  .filter((p) => details?.[p.key] && p.options.some(([v]) => v === details[p.key]))
  .map((p) => ({ key: p.key, label: BUYER_LABELS[p.key] || p.label, answer: labelOf(p.options, details[p.key]), tone: partTone(p.key, details[p.key]) }));

/** [label, answer] for each part that was answered, in the usual order. */
export const conditionRows = (details) => CONDITION_PARTS.filter((p) => details?.[p.key]).map((p) => [p.label, labelOf(p.options, details[p.key])]);
export const MAX_PHOTO_MB = 5;

export const labelOf = (pairs, value) => pairs.find(([k]) => k === value)?.[1] ?? value ?? '';

export function formatPrice(value) {
  if (value === undefined || value === null || value === '') return 'Price on request';
  if (Number(value) === 0) return 'Free';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export const placeLabel = (listing) => [listing?.addressArea, listing?.city].filter(Boolean).join(', ');
export const photosOf = (listing) => listing?.device?.photos || [];
