import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import Alert from '../ui/Alert';
import Skeleton from '../ui/Skeleton';
import { AdviceView } from './AiAssist';
import { useFetch } from '../../hooks/useFetch';
import { aiApi, matchApi } from '../../services/aiApi';
import { technicianApi } from '../../services/repairApi';
import { friendlyMessage, toApiError } from '../../utils/errors';

// What to look for, by the service the owner chose for the device.
const LOOKUPS = {
  repair: [{ key: 'technicians', title: 'Technicians who fit this repair' }],
  refurbishment: [{ key: 'refurbishers', title: 'Refurbishers near you' }, { key: 'wanted', title: 'Refurbishers asking for a device like this' }],
  recycling: [{ key: 'recyclers', title: 'Recycling centres that take this device' }],
};

function Row({ name, link, reasons, score }) {
  return (
    <li className="glass-subtle flex flex-wrap items-start justify-between gap-2 p-3">
      <div className="min-w-0">
        <p className="font-semibold text-ink dark:text-white">{link ? <Link to={link} className="hover:underline">{name}</Link> : name}</p>
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{reasons.join(' · ')}</p>
      </div>
      <span className="font-numeric rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary dark:text-primary-tint" aria-label={`Match ${Math.round(score)} out of 100`}>{Math.round(score)}% match</span>
    </li>
  );
}

function Group({ listingId, lookup }) {
  const { data, error, loading } = useFetch((signal) => (
    lookup.key === 'technicians'
      ? technicianApi.recommendations(listingId, signal)
      : matchApi.forListing(listingId, lookup.key, signal)
  ), [listingId, lookup.key]);
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-ink dark:text-white">{lookup.title}</h3>
      {loading && <Skeleton className="h-14 w-full" />}
      {error && <Alert variant="error">{friendlyMessage(toApiError(error))}</Alert>}
      {data && data.length === 0 && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">No one fits yet. New providers join often, so check again later.</p>}
      {data && data.length > 0 && (
        <ul className="space-y-2">
          {data.slice(0, 5).map((m) => (m.technician
            ? <Row key={m.technician._id} name={m.technician.name} link={`/technicians/${m.technician._id}`} reasons={m.reasons} score={m.score} />
            : <Row key={m.id} name={m.name || m.title} reasons={m.reasons} score={m.score} />))}
        </ul>
      )}
    </div>
  );
}

/** For the owner of a device: AI advice on what to do with it, and who fits, with the reasons. */
export default function SmartMatches({ listing }) {
  const [advice, setAdvice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lookups = LOOKUPS[listing.preferredService] || [];

  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      setAdvice(await aiApi.advice({ listingId: listing._id }));
    } catch (err) {
      setError(friendlyMessage(toApiError(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard as="section" aria-label="Smart suggestions" className="mt-6 space-y-5">
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink dark:text-white"><Sparkles size={18} aria-hidden /> Smart suggestions</h2>
      <div className="space-y-3">
        <Alert variant="error">{error}</Alert>
        <button type="button" className="btn btn-glass" disabled={busy} onClick={ask}>{busy ? 'Thinking…' : 'Should I repair, refurbish, reuse or recycle this?'}</button>
        {advice && <AdviceView result={advice} />}
      </div>
      {lookups.map((l) => <Group key={l.key} listingId={listing._id} lookup={l} />)}
    </GlassCard>
  );
}
