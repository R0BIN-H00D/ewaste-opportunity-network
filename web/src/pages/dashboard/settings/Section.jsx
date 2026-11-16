import GlassCard from '../../../components/glass/GlassCard';
import Alert from '../../../components/ui/Alert';

export default function Section({ id, title, description, save, children }) {
  return (
    <GlassCard as="section" id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4">
      <h2 id={`${id}-title`} className="text-lg font-bold text-ink dark:text-white">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{description}</p>}
      <div className="mt-4 space-y-4">
        {save?.status === 'error' && <Alert variant="error">{save.message}</Alert>}
        {save?.status === 'saved' && <Alert variant="success">{save.message}</Alert>}
        {children}
      </div>
    </GlassCard>
  );
}
