import GlassCard from '../../components/glass/GlassCard';

export default function AuthShell({ title, subtitle, children, wide = false }) {
  return (
    <div className={`mx-auto flex min-h-[70vh] items-center px-4 py-10 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
      <GlassCard className="w-full">
        <h1 className="text-2xl font-bold text-ink dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </GlassCard>
    </div>
  );
}

export const linkClass = 'font-semibold text-secondary-strong underline-offset-2 hover:underline dark:text-primary-tint';
