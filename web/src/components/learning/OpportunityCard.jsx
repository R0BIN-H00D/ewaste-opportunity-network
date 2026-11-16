import { Link } from 'react-router-dom';
import { CalendarClock, GraduationCap, MapPin, ShieldCheck, Users } from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import Badge from '../ui/Badge';
import { Rating } from '../requests/TechnicianCard';
import { applicationLabel, difficultyLabel, difficultyTone, opportunityLabel, opportunityTone } from '../../lib/learning';

export const day = (v) => (v ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(v)) : '');

/** Every task is supervised and free of hazardous handling (BR-07), so every card says so. */
export function SupervisedTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary dark:text-primary-tint">
      <ShieldCheck size={12} aria-hidden /> Supervised · no hazardous handling
    </span>
  );
}

export function SkillChips({ skills, max = 4 }) {
  if (!skills?.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
      {skills.slice(0, max).map((s) => <li key={s} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary dark:text-primary-tint">{s}</li>)}
      {skills.length > max && <li className="rounded-full bg-primary/5 px-2.5 py-0.5 text-xs text-ink-muted dark:text-[#9FB2A7]">+{skills.length - max} more</li>}
    </ul>
  );
}

/** One learning opportunity. `manager` swaps the supervisor line for the application counts and shows the status. */
export default function OpportunityCard({ opportunity: o, to, manager = false }) {
  const counts = o.counts || {};
  const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([s, n]) => `${n} ${applicationLabel(s).toLowerCase()}`);
  return (
    <GlassCard as="article" className="flex h-full flex-col gap-3 !p-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={difficultyTone(o.difficulty)}>{difficultyLabel(o.difficulty)}</Badge>
          {(manager || o.status !== 'open') && <Badge tone={opportunityTone(o.status)}>{opportunityLabel(o.status)}</Badge>}
          {o.deviceType && <span className="inline-flex items-center gap-1 text-xs text-ink-muted dark:text-[#9FB2A7]"><GraduationCap size={12} aria-hidden />{o.deviceType.name}</span>}
        </div>
        <h2 className="text-lg font-bold text-ink dark:text-white"><Link to={to} className="hover:underline">{o.title}</Link></h2>
      </div>
      <SkillChips skills={o.requiredSkills} />
      <ul className="space-y-1 text-xs text-ink-muted dark:text-[#9FB2A7]">
        <li className="flex items-center gap-1"><MapPin size={12} aria-hidden />{o.locationArea}</li>
        <li className="flex items-center gap-1"><CalendarClock size={12} aria-hidden />Apply by {day(o.deadline)}</li>
        <li className="flex items-center gap-1"><Users size={12} aria-hidden />{o.seatsLeft} of {o.seats} {o.seats === 1 ? 'place' : 'places'} left</li>
      </ul>
      <SupervisedTag />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        {manager
          ? <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{parts.length ? parts.join(' · ') : 'No applications yet'}</p>
          : <p className="flex items-center gap-2 text-xs text-ink-muted dark:text-[#9FB2A7]">Supervised by {o.supervisor?.name}<Rating avg={o.supervisor?.ratingAvg} count={o.supervisor?.ratingCount} /></p>}
        <Link to={to} className="btn btn-glass !px-3 !py-1.5 text-sm">{manager ? 'Manage' : 'View task'}</Link>
      </div>
    </GlassCard>
  );
}
