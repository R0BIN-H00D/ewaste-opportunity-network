import GlassCard from '../glass/GlassCard';

/** Says whether a figure was counted, weighed, or only worked out. A figure never appears without one. */
export const KIND = { actual: ['Actual', 'bg-success/15 text-[#166534] dark:text-green-300'], measured: ['Measured', 'bg-success/15 text-[#166534] dark:text-green-300'], estimate: ['Estimate', 'bg-warning/15 text-[#92400E] dark:text-amber-300'] };

export function KindChip({ kind }) {
  const [label, tone] = KIND[kind];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

/** One headline figure with its label and what kind of figure it is. */
export function Tile({ label, value, kind, help }) {
  return (
    <GlassCard className="!p-4 text-center">
      <p className="font-numeric text-3xl font-extrabold text-primary dark:text-primary-tint">{value}</p>
      <p className="mt-1 text-sm font-medium text-ink dark:text-white">{label}</p>
      {kind && <p className="mt-1"><KindChip kind={kind} /></p>}
      {help && <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">{help}</p>}
    </GlassCard>
  );
}
