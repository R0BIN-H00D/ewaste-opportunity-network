/** A bordered box with a title and icon that holds one action the viewer can take. */
export default function ActionBox({ title, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-black/10 p-4 dark:border-white/15" aria-label={title}>
      <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-ink dark:text-white">{Icon && <Icon size={18} aria-hidden className="text-primary dark:text-primary-tint" />}{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
