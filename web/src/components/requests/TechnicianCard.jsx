import { Link } from 'react-router-dom';
import { BadgeCheck, MapPin, Star, Wrench } from 'lucide-react';
import Badge from '../ui/Badge';
import { assetUrl } from '../../services/api';
import { AVAILABILITY, formatMoney } from '../../lib/requests';

export function Rating({ avg, count }) {
  if (!count) return <span className="text-xs text-ink-muted dark:text-[#9FB2A7]">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink dark:text-white" aria-label={`Rated ${avg.toFixed(1)} out of 5 from ${count} ${count === 1 ? 'review' : 'reviews'}`}>
      <Star size={14} aria-hidden className="fill-warning text-warning" /> {avg.toFixed(1)} <span className="font-normal text-ink-muted dark:text-[#9FB2A7]">({count})</span>
    </span>
  );
}

export function Avatar({ person, size = 'h-12 w-12' }) {
  return person?.avatar ? (
    <img src={assetUrl(person.avatar)} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <span aria-hidden className={`${size} grid shrink-0 place-items-center rounded-full bg-primary/10 text-primary dark:text-primary-tint`}><Wrench size={20} /></span>
  );
}

/**
 * One technician. In the directory it links to their profile; when choosing for a repair it shows the match
 * (score, reasons, price estimate) and a radio so exactly one can be selected.
 */
export default function TechnicianCard({ technician: t, match, selected, onSelect, name = 'technician' }) {
  const availability = AVAILABILITY.find(([k]) => k === t.availability?.status)?.[1] || 'Available';
  const body = (
    <>
      <Avatar person={t} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-bold text-ink dark:text-white">{t.name}</h3>
          <Badge tone="green"><BadgeCheck size={12} aria-hidden className="mr-1" />Verified</Badge>
          {t.availability?.status !== 'available' && <Badge tone="amber">{availability}</Badge>}
        </div>
        {t.headline && <p className="mt-0.5 text-sm text-ink-muted dark:text-[#9FB2A7]">{t.headline}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted dark:text-[#9FB2A7]">
          <Rating avg={t.ratingAvg} count={t.ratingCount} />
          <span>{t.completedJobs} {t.completedJobs === 1 ? 'job' : 'jobs'} done</span>
          {t.experienceYears > 0 && <span>{t.experienceYears} yrs experience</span>}
          {(t.serviceAddressArea || t.city) && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden />{[t.serviceAddressArea, t.city].filter(Boolean).join(', ')}</span>}
          {t.distanceKm !== undefined && <span>{t.distanceKm} km away</span>}
        </div>
        {match && (
          <div className="mt-2 text-sm">
            <p className="font-semibold text-primary dark:text-primary-tint">Match score {Math.round(match.score)}/100</p>
            {match.reasons?.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-ink-muted dark:text-[#9FB2A7]">{match.reasons.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul>}
            {match.estimatedCharge && <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">Typical charge about {formatMoney(match.estimatedCharge.amount)} (estimate only; the technician sends the real quotation after checking the device).</p>}
          </div>
        )}
      </div>
    </>
  );

  if (onSelect) {
    return (
      <label className={`glass flex cursor-pointer gap-4 !p-4 transition ${selected ? 'ring-2 ring-secondary-strong' : ''}`}>
        <input type="radio" name={name} checked={Boolean(selected)} onChange={() => onSelect(t._id)} className="mt-1 h-5 w-5 shrink-0 accent-[#1E8449]" aria-label={`Choose ${t.name}`} />
        {body}
      </label>
    );
  }
  return (
    <article className="glass flex gap-4 !p-4 transition hover:-translate-y-0.5 hover:shadow-e2">
      {body}
      <Link to={`/technicians/${t._id}`} className="btn btn-glass self-center whitespace-nowrap" aria-label={`View ${t.name}'s profile`}>View profile</Link>
    </article>
  );
}
