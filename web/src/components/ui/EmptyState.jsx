import GlassCard from '../glass/GlassCard';

export default function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <GlassCard className="mx-auto max-w-xl text-center">
      {Icon && (
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary dark:text-primary-tint">
          <Icon size={28} aria-hidden />
        </span>
      )}
      <h2 className="text-lg font-bold text-ink dark:text-white">{title}</h2>
      {children && <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </GlassCard>
  );
}
