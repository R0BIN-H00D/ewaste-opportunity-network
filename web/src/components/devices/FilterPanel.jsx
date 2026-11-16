import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import TextField from '../ui/TextField';
import { CONDITIONS, SERVICES, SORTS } from '../../lib/devices';

export const FILTER_KEYS = ['q', 'category', 'condition', 'service', 'city', 'minPrice', 'maxPrice', 'sort'];

/** Search + filters. Dropdowns apply immediately; text and price fields apply on Search / Enter. */
export default function FilterPanel({ values, categories, onApply, onClear }) {
  const [draft, setDraft] = useState(values);
  const [error, setError] = useState('');
  const key = JSON.stringify(values);
  useEffect(() => setDraft(values), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (name) => (e) => setDraft((d) => ({ ...d, [name]: e.target.value }));
  const applyNow = (name) => (e) => {
    const next = { ...draft, [name]: e.target.value };
    setDraft(next);
    submit(next);
  };
  const submit = (next = draft) => {
    const min = next.minPrice === '' ? null : Number(next.minPrice);
    const max = next.maxPrice === '' ? null : Number(next.maxPrice);
    if ((min !== null && (Number.isNaN(min) || min < 0)) || (max !== null && (Number.isNaN(max) || max < 0))) return setError('Prices must be zero or more.');
    if (min !== null && max !== null && min > max) return setError('Minimum price cannot be higher than the maximum.');
    setError('');
    onApply(next);
  };
  const active = FILTER_KEYS.some((k) => k !== 'sort' && values[k]);

  return (
    <form
      role="search"
      aria-label="Search and filter devices"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="glass space-y-4 p-5"
    >
      <TextField label="Search" type="search" value={draft.q} onChange={set('q')} placeholder="Laptop, charger, Samsung…" maxLength={100} />
      <TextField as="select" label="Category" value={draft.category} onChange={applyNow('category')}>
        <option value="">All categories</option>
        {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
      </TextField>
      <TextField as="select" label="Condition" value={draft.condition} onChange={applyNow('condition')}>
        <option value="">Any condition</option>
        {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </TextField>
      <TextField as="select" label="Best suited for" value={draft.service} onChange={applyNow('service')}>
        <option value="">Any service</option>
        {SERVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </TextField>
      <TextField label="City" value={draft.city} onChange={set('city')} placeholder="e.g. Bengaluru" maxLength={80} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Min price (₹)" type="number" inputMode="numeric" min="0" value={draft.minPrice} onChange={set('minPrice')} />
        <TextField label="Max price (₹)" type="number" inputMode="numeric" min="0" value={draft.maxPrice} onChange={set('maxPrice')} />
      </div>
      {error && <p role="alert" className="text-xs font-medium text-danger dark:text-red-300">{error}</p>}
      <TextField as="select" label="Sort by" value={draft.sort || 'newest'} onChange={applyNow('sort')}>
        {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </TextField>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1"><Search size={16} aria-hidden /> Search</button>
        {active && (
          <button type="button" onClick={onClear} className="btn btn-glass" aria-label="Clear all filters"><X size={16} aria-hidden /> Clear</button>
        )}
      </div>
    </form>
  );
}
