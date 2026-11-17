import { useId } from 'react';
import GlassCard from '../glass/GlassCard';

/**
 * A short list of bars: a name, a bar as long as its count, the count, and what it was made of. Drawn with plain elements, so
 * the numbers are real text that a screen reader reads in order and a phone can zoom; the bar is only a picture of them.
 * `items` are `{ key, label, value, detail }`.
 */
export default function BarList({ title, summary, items }) {
  const id = useId();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <GlassCard as="section" aria-labelledby={`${id}-title`} className="space-y-3">
      <div>
        <h2 id={`${id}-title`} className="text-base font-bold text-ink dark:text-white">{title}</h2>
        {summary && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{summary}</p>}
      </div>
      <ul className="space-y-3" aria-label={title}>
        {items.map((i) => (
          <li key={i.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm text-ink dark:text-[#E8F1EB]">
              <span className="font-semibold">{i.label}</span>
              <span className="tabular-nums">{i.value}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: 'var(--viz-1)' }} />
            </div>
            {i.detail && <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">{i.detail}</p>}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}