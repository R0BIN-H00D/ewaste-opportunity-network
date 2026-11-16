// Words and number formats for the analytics page, so the charts, tables and tiles all say things the same way.
export const SERVICE_LABEL = { repairs: 'Repairs', donations: 'Donations', refurbishment: 'Refurbishment', recycling: 'Recycling' };
export const SERVICE_ORDER = Object.keys(SERVICE_LABEL);

export const number = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
export const kg = (n) => `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)} kg`;
export const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-11` → "Nov ’26" (axis) or "November 2026" (table, tooltip). Months are calendar months in UTC, as the server counts them. */
export function monthLabel(key, style = 'short') {
  const date = new Date(`${key}-01T00:00:00.000Z`);
  if (style === 'long') return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  return `${SHORT_MONTHS[date.getUTCMonth()]} ’${key.slice(2, 4)}`; // the apostrophe keeps "Nov ’26" from reading as 26 November
}

/** What can be exported, and which filters each export takes (the server refuses the others). */
export const EXPORTS = [
  { kind: 'users', label: 'People', filters: ['role', 'status', 'dates'], note: 'Names, email addresses, roles and account state. No phone numbers.' },
  { kind: 'listings', label: 'Listings', filters: ['status', 'dates'], note: 'Titles, categories, owners and the public area. Never an exact address.' },
  { kind: 'repairs', label: 'Repair requests', filters: ['dates'], note: 'Who took part, status and dates.' },
  { kind: 'donations', label: 'Donations', filters: ['dates'], note: 'Who took part, status and dates.' },
  { kind: 'refurbishment', label: 'Refurbishment jobs', filters: ['dates'], note: 'Who took part, status, dates and the agreed offer.' },
  { kind: 'recycling', label: 'Recycling requests', filters: ['dates'], note: 'Devices, and weighed and estimated kilograms in separate columns.' },
  { kind: 'transactions', label: 'Payments', filters: ['dates'], note: 'Amounts and methods recorded offline. The platform never handles money.' },
];
export const ACCOUNT_STATUS_OPTIONS = [['active', 'Active'], ['pending_verification', 'Waiting for verification'], ['suspended', 'Suspended'], ['deleted', 'Deleted']];
export const LISTING_STATUS_OPTIONS = [['draft', 'Draft'], ['listed', 'Listed'], ['in_service', 'In service'], ['completed', 'Completed'], ['withdrawn', 'Withdrawn'], ['removed_by_admin', 'Removed by an administrator']];
