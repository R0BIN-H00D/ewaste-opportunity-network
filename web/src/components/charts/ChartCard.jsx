import { useId, useState } from 'react';
import GlassCard from '../glass/GlassCard';

/**
 * A titled card around one chart.
 *
 * - The chart is a picture, so it is exposed to assistive technology as one image with the headline in its label, and the very
 *   same numbers are always one click away as a real table. Some of the series colours are light on a light surface, so the
 *   table is also how anyone can read the exact values.
 * - With two or more series a legend is always shown, because colour alone must never say which is which.
 *
 * @param legend  [{ key, name, color }]
 * @param columns table headings
 * @param rows    arrays of cell values, in the order of `columns`
 */
export default function ChartCard({ title, summary, legend = [], columns = [], rows = [], height = 260, className = '', children }) {
  const id = useId();
  const [table, setTable] = useState(false);
  return (
    <GlassCard as="section" aria-labelledby={`${id}-title`} className={`space-y-3 ${className}`}>
      <div>
        <h2 id={`${id}-title`} className="text-base font-bold text-ink dark:text-white">{title}</h2>
        {summary && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{summary}</p>}
      </div>

      {legend.length > 1 && (
        <ul aria-label={`Legend for ${title}`} className="viz-root flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink dark:text-[#E8F1EB]">
          {legend.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-2">
              <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}

      {table ? (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${title}, table`}>
          <table className="w-full text-left text-sm text-ink dark:text-[#E8F1EB]">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-black/10 dark:border-white/15">
                {columns.map((c) => <th key={c} scope="col" className="py-2 pr-4 font-semibold">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r[0])} className="border-b border-black/5 dark:border-white/10">
                  {r.map((cell, j) => (j === 0
                    ? <th key={columns[j]} scope="row" className="py-1.5 pr-4 font-medium">{cell}</th>
                    : <td key={columns[j]} className="font-numeric py-1.5 pr-4">{cell}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="viz-root text-xs" style={{ height }} role="img" aria-label={[title, summary].filter(Boolean).join('. ')}>
          {children}
        </div>
      )}

      <button type="button" className="btn btn-glass !min-h-[40px] !px-3 text-sm" aria-expanded={table} onClick={() => setTable((t) => !t)}>
        {table ? 'Show the chart' : 'Show as a table'}
      </button>
    </GlassCard>
  );
}
