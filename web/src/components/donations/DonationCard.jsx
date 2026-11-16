import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import Badge from '../ui/Badge';
import { Thumb } from '../devices/DeviceCard';
import { CONDITIONS, labelOf, placeLabel } from '../../lib/devices';
import { REQUEST_STATUS, donationLabel, donationTone } from '../../lib/donations';

const CONDITION_TONE = { fully_working: 'green', minor_damage: 'amber', major_damage: 'amber', not_working: 'red', for_spare_parts: 'neutral' };

/** One donation in a list. `to` lets the dashboard link to its own detail page. */
export default function DonationCard({ donation: d, to }) {
  const href = to || `/donations/${d._id}`;
  const l = d.listing || {};
  const place = placeLabel(l);
  const mine = d.myRequest && REQUEST_STATUS[d.myRequest.status];
  return (
    <article className="glass flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-e2">
      <Link to={href} aria-label={`View ${l.title}`}><Thumb listing={l} className="aspect-[4/3]" /></Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={CONDITION_TONE[l.condition]}>{labelOf(CONDITIONS, l.condition)}</Badge>
          {d.status !== 'open' && <Badge tone={donationTone(d.status)}>{donationLabel(d.status)}</Badge>}
          {mine && <Badge tone={mine[1]}>Your request: {mine[0]}</Badge>}
          {d.pendingRequests > 0 && <Badge tone="amber">{d.pendingRequests} {d.pendingRequests === 1 ? 'request' : 'requests'} waiting</Badge>}
        </div>
        <h3 className="text-base font-bold leading-snug text-ink dark:text-white"><Link to={href} className="hover:underline">{l.title}</Link></h3>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{[l.category?.name, l.brand, l.model].filter(Boolean).join(' · ')}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">
          <span>Donated by {d.donor?.name}</span>
          {place && <span className="flex min-w-0 items-center gap-1"><MapPin size={14} aria-hidden className="shrink-0" /><span className="truncate">{place}</span></span>}
        </div>
      </div>
    </article>
  );
}
