import GlassCard from '../glass/GlassCard';
import Art from '../art/Illustrations';

/** An empty or "nothing found" panel. `art` (a name from art/Illustrations) shows a drawing; without it the small icon tile is used. */
export default function EmptyState({ icon: Icon, art, title, children, action }) {
  return (
    <GlassCard className="mx-auto max-w-xl text-center">
      {art ? (
        <Art name={art} className="mx-auto mb-2 h-28 w-40" />
      ) : (
        Icon && (
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary dark:text-primary-tint">
            <Icon size={28} aria-hidden />
          </span>
        )
      )}
      <h2 className="text-lg font-bold text-ink dark:text-white">{title}</h2>
      {children && <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </GlassCard>
  );
}
