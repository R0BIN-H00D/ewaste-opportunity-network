// Labels and helpers for device listings. Values mirror backend/src/config/constants.js.
export const CONDITIONS = [
  ['fully_working', 'Fully working'],
  ['minor_damage', 'Minor damage'],
  ['major_damage', 'Major damage'],
  ['not_working', 'Not working'],
  ['for_spare_parts', 'For spare parts'],
];
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
export const MAX_PHOTO_MB = 5;

export const labelOf = (pairs, value) => pairs.find(([k]) => k === value)?.[1] ?? value ?? '';

export function formatPrice(value) {
  if (value === undefined || value === null || value === '') return 'Price on request';
  if (Number(value) === 0) return 'Free';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export const placeLabel = (listing) => [listing?.addressArea, listing?.city].filter(Boolean).join(', ');
export const photosOf = (listing) => listing?.device?.photos || [];
