// Labels for the refurbished marketplace. Values mirror backend/src/config/constants.js.
export const PRODUCT_CONDITIONS = [
  ['like_new', 'Like new'],
  ['excellent', 'Excellent'],
  ['good', 'Good'],
  ['fair', 'Fair'],
];
export const PRODUCT_SORTS = [
  ['newest', 'Newest first'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Best rated seller'],
];
export const PAYMENT_METHODS = [
  ['cod', 'Cash on delivery'],
  ['offline', 'Pay the seller directly'],
  ['online', 'Pay online'],
];
// The three ways to pay, with a line for each on the order page.
export const PAYMENT_CHOICES = [
  ['cod', 'Cash on delivery', 'Pay in cash when the device is handed over.'],
  ['offline', 'Pay the seller directly', 'Agree the payment with the seller, for example by UPI or a transfer.'],
  ['online', 'Pay online', 'Pay in a secure payment window from your order page after you place it.'],
];

/** Same rules as the server, so people are told straight away what to fix. */
export function validateDelivery({ deliveryArea, deliveryCity, deliveryPincode }) {
  const errors = {};
  const area = deliveryArea.trim();
  const city = deliveryCity.trim();
  if (area.length < 3 || !/[A-Za-z]/.test(area)) errors.deliveryArea = 'Enter the area or locality to deliver to.';
  if (city.length < 2 || !/^[A-Za-z][A-Za-z .'-]*$/.test(city)) errors.deliveryCity = 'Enter the city (letters only).';
  if (!/^[1-9][0-9]{5}$/.test(deliveryPincode.trim())) errors.deliveryPincode = 'Enter a valid 6-digit pincode.';
  return errors;
}
export const PRODUCT_STATUS = { active: ['On sale', 'green'], sold: ['Sold', 'neutral'], hidden: ['Hidden', 'amber'] };

export const ORDER_STATUS = {
  placed: ['Placed', 'amber'],
  confirmed: ['Confirmed', 'blue'],
  ready: ['Ready', 'blue'],
  delivered: ['Handed over', 'blue'],
  completed: ['Completed', 'green'],
  cancelled: ['Cancelled', 'neutral'],
};
export const orderLabel = (s) => ORDER_STATUS[s]?.[0] || String(s).replace(/_/g, ' ');
export const orderTone = (s) => ORDER_STATUS[s]?.[1] || 'neutral';

// What each server-decided action says on its button.
export const ORDER_ACTIONS = {
  confirm: ['confirmed', 'Confirm the order'],
  mark_ready: ['ready', 'Mark ready'],
  mark_delivered: ['delivered', 'Mark handed over'],
  complete: ['completed', 'I received it'],
};

const STEPS = [['placed', 'Placed'], ['confirmed', 'Confirmed'], ['ready', 'Ready'], ['delivered', 'Handed over'], ['completed', 'Completed']];
/** [{ key, label, state }] for the order tracker. A cancelled order shows how far it got. */
export function orderSteps(order) {
  let status = order.status;
  const stopped = status === 'cancelled';
  if (stopped) {
    const last = [...(order.history || [])].reverse().find((h) => STEPS.some(([k]) => k === h.status));
    status = last?.status || 'placed';
  }
  const at = STEPS.findIndex(([k]) => k === status);
  return STEPS.map(([key, label], i) => ({ key, label, state: status === 'completed' || i < at ? 'done' : i === at ? (stopped ? 'done' : 'current') : 'todo' }));
}

/** "RAM: 8 GB" lines <-> { RAM: '8 GB' }. Blank lines are ignored; a line needs a name and a value. */
export function parseSpecs(text) {
  const specs = {};
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 1 || !line.slice(i + 1).trim()) return { error: `Write each specification as "Name: value". Check “${line.slice(0, 30)}”.` };
    specs[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { specs };
}
export const specsToText = (specs) => Object.entries(specs || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
