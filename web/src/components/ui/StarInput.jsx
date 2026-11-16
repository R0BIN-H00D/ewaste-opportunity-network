import { Star } from 'lucide-react';

/** Read-only stars for a rating from 0 to 5 (decimals fill the nearest whole star). */
export function Stars({ value = 0, size = 16 }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${Number(value).toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} aria-hidden className={n <= Math.round(value) ? 'fill-warning text-warning' : 'text-gray-400/60'} />
      ))}
    </span>
  );
}

/** 1 to 5 star picker built from radio buttons, so it works with keyboard and screen readers. */
export default function StarInput({ label, value, onChange, name, required = false, error, size = 28 }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink dark:text-white">{label}{required ? ' *' : ''}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <span className="block rounded-lg p-1 peer-focus-visible:ring-2 peer-focus-visible:ring-secondary-strong">
              <Star size={size} aria-hidden className={n <= value ? 'fill-warning text-warning' : 'text-gray-400'} />
            </span>
            <span className="sr-only">{n} {n === 1 ? 'star' : 'stars'}</span>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-1 text-xs font-medium text-danger dark:text-red-300">{error}</p>}
    </fieldset>
  );
}
