import GlassCard from '../glass/GlassCard';

/** Consistent heading block + readable column for text pages. */
export default function PageShell({ title, intro, children, wide = false }) {
  return (
    <div className={`mx-auto px-4 py-12 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>
      <h1 className="text-3xl font-extrabold text-ink dark:text-white sm:text-4xl">{title}</h1>
      {intro && <p className="mt-3 text-lg text-ink-muted dark:text-[#9FB2A7]">{intro}</p>}
      <div className="mt-8 space-y-4">{children}</div>
    </div>
  );
}

export function TextCard({ title, children }) {
  return (
    <GlassCard>
      {title && <h2 className="text-lg font-bold text-ink dark:text-white">{title}</h2>}
      <div className="mt-2 text-sm leading-relaxed text-ink dark:text-[#E8F1EB]">{children}</div>
    </GlassCard>
  );
}
