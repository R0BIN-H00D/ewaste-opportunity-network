import { monthLabel } from './analytics';

// Words and colours for impact, so the public page, the dashboard and the charts all say things the same way.

export const TYPE_LABEL = { repair: 'Repaired', reuse: 'Reused', donation: 'Donated', refurbishment: 'Refurbished', recycling: 'Recycled' };
export const TYPE_ORDER = Object.keys(TYPE_LABEL);
// Colour is never the only way to tell a series apart: the chart always has a legend and a table.
export const TYPE_COLOR = { repair: 'var(--viz-1)', reuse: 'var(--viz-4)', donation: 'var(--viz-2)', refurbishment: 'var(--viz-3)', recycling: '#8b5cf6' };

/** One chart series per kind of activity. */
export const typeSeries = TYPE_ORDER.map((key) => ({ key, name: TYPE_LABEL[key], color: TYPE_COLOR[key] }));

/** The monthly series flattened for a stacked chart: `{ month, repair, reuse, ... }`. */
export const monthlyRows = (months = []) => months.map((m) => ({ month: m.month, ...Object.fromEntries(TYPE_ORDER.map((t) => [t, m.byType?.[t] || 0])) }));

/** The same figures as table rows, in the order of `['Month', ...labels]`. */
export const monthlyTable = (months = []) => months.map((m) => [monthLabel(m.month, 'long'), ...TYPE_ORDER.map((t) => m.byType?.[t] || 0)]);
export const monthlyColumns = ['Month', ...TYPE_ORDER.map((t) => TYPE_LABEL[t])];

/** "8 more points to reach Sprout." or the top-level message. */
export function nextLevelText(level, score) {
  if (!level?.next) return 'You have reached the highest level.';
  return `${Math.max(0, level.next.min - score)} more points to reach ${level.next.name}.`;
}

export const signedPoints = (n) => (n > 0 ? `+${n}` : String(n));

/** How far through a badge's goal someone is, as "2.5 of 10". */
export const badgeProgress = (b) => {
  const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return `${fmt(b.progress.done)} of ${fmt(b.progress.needed)}`;
};

/** True when nothing has been recorded at all, so a page can say so instead of showing a wall of zeros. */
export const isEmptyImpact = (d) => !d || ((d.devices?.diverted ?? d.devices?.total ?? 0) === 0 && (d.materials?.measuredKg ?? 0) === 0 && (d.materials?.estimatedKg ?? 0) === 0);

/** The yearly series as rows for a bar list: one bar per year, with what it was made of. */
export const yearlyItems = (years = []) => years.map((y) => ({
  key: String(y.year),
  label: String(y.year),
  value: y.devices || 0,
  detail: TYPE_ORDER.filter((t) => y.byType?.[t] > 0).map((t) => `${TYPE_LABEL[t]} ${y.byType[t]}`).join(' · '),
}));

/** The category breakdown as rows for a bar list. A row with no category is "Other". */
export const categoryItems = (categories = []) => categories.map((c) => ({
  key: c.category?._id || 'other',
  label: c.category?.name || 'Other',
  value: c.devices || 0,
  detail: TYPE_ORDER.filter((t) => c.byType?.[t] > 0).map((t) => `${TYPE_LABEL[t]} ${c.byType[t]}`).join(' · '),
}));

/** Whether a list of bar rows has anything to show. */
export const hasValues = (items = []) => items.some((i) => i.value > 0);
