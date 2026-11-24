import { Briefcase, Lock, Mail, MapPin, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import GlassCard from '../../../components/glass/GlassCard';
import Alert from '../../../components/ui/Alert';

// Each section gets a small icon so the page can be scanned at a glance.
const ICONS = { account: UserRound, email: Mail, profile: MapPin, 'role-details': Briefcase, verification: ShieldCheck, security: Lock, danger: Trash2 };

export default function Section({ id, title, description, save, children }) {
  const Icon = ICONS[id];
  const danger = id === 'danger';
  return (
    <GlassCard as="section" id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-24 !rounded-3xl !p-6 sm:!p-7 ${danger ? 'ring-1 ring-danger/20' : ''}`}>
      <div className="flex items-start gap-3.5">
        {Icon && <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${danger ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary dark:text-primary-tint'}`}><Icon size={20} /></span>}
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-lg font-bold text-ink dark:text-white">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted dark:text-[#9FB2A7]">{description}</p>}
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {save?.status === 'error' && <Alert variant="error">{save.message}</Alert>}
        {save?.status === 'saved' && <Alert variant="success">{save.message}</Alert>}
        {children}
      </div>
    </GlassCard>
  );
}
