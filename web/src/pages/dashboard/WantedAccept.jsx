import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CalendarClock, CheckCircle2, Layers, MapPin, MessageCircle, ShieldCheck, Tag } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { refurbApi } from '../../services/refurbishmentApi';
import { CONDITIONS, labelOf } from '../../lib/devices';
import { friendlyMessage } from '../../utils/errors';

const BOARD = '/dashboard/wanted';

// Taps that start the message, so it is easy to say what you have.
const IDEAS = [
  'I have this device and can hand it over this week.',
  'I have a few of these. Please message me to talk about the condition.',
  'I can give it for free.',
  'I would like to sell it. Please tell me what you can pay.',
];

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function Fact({ icon, label, children }) {
  const Icon = icon;
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-black/[0.03] p-4 dark:bg-white/5">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary dark:text-primary-tint"><Icon size={18} /></span>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]">{label}</dt>
        <dd className="mt-0.5 font-semibold text-ink dark:text-white">{children}</dd>
      </div>
    </div>
  );
}

/** The page where a device owner or technician accepts one wanted-device request, with all its details in front of them. */
export default function WantedAccept() {
  const { id } = useParams();
  const save = useSave();
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(null);
  const { data: w, error, loading, reload } = useFetch((signal) => refurbApi.getWanted(id, signal), [id]);

  if (loading && !w) return <div className="mx-auto max-w-4xl space-y-5" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-72 w-full !rounded-3xl" /></div>;
  if (error && !w) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <ErrorState error={missing ? { message: 'This request does not exist or is no longer open.' } : error} title={missing ? 'Request not found' : 'Could not load this request'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to={BOARD} className="font-semibold text-primary underline dark:text-primary-tint">Back to wanted devices</Link></p>
      </div>
    );
  }

  const accepted = Boolean(done) || w.hasResponded;
  const sentMessage = done ? done.message : w.myResponse?.message;
  const closed = w.status !== 'open';
  const blocked = w.isMine ? 'This is your own request, so you cannot accept it.' : closed ? 'This request is closed. The refurbisher is no longer looking for it.' : '';
  const condition = w.minCondition ? `${labelOf(CONDITIONS, w.minCondition)} or better` : 'Any condition';

  const submit = async (e) => {
    e.preventDefault();
    const text = message.trim();
    const res = await save.run(() => refurbApi.respondWanted(w._id, text), 'Accepted');
    if (res.ok) setDone({ message: text });
    return res;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to={BOARD} className="glass-subtle inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Wanted devices</Link>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink dark:text-white">Accept this request</h1>
        <p className="mt-1 text-ink-muted dark:text-[#9FB2A7]">Read what they are looking for, then tell them how you can help.</p>
      </div>

      <GlassCard as="section" aria-label="Request details" className="space-y-6 !rounded-3xl !p-6 sm:!p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary dark:text-primary-tint">{w.category?.name || 'Any device'}</span>
            <h2 className="mt-3 text-2xl font-bold text-ink dark:text-white">{w.title}</h2>
          </div>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Posted {when(w.createdAt)}</p>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact icon={Layers} label="How many they need">{w.quantity}</Fact>
          <Fact icon={BadgeCheck} label="Condition">{condition}</Fact>
          {w.brand && <Fact icon={Tag} label="Brand">{w.brand}</Fact>}
          {w.city && <Fact icon={MapPin} label="City">{w.city}</Fact>}
          <Fact icon={CalendarClock} label="Status">{closed ? 'Closed' : 'Open'}</Fact>
        </dl>

        {w.notes && (
          <div>
            <h3 className="text-sm font-semibold text-ink dark:text-white">What they wrote</h3>
            <p className="mt-1 whitespace-pre-line leading-relaxed text-ink dark:text-[#E8F1EB]">{w.notes}</p>
          </div>
        )}

        <p className="flex items-center gap-3 border-t border-black/5 pt-5 text-sm text-ink-muted dark:border-white/10 dark:text-[#9FB2A7]">
          <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-bold text-white dark:bg-primary-tint dark:text-canvas-dark">{initials(w.refurbisher?.name)}</span>
          <span>Wanted by <span className="font-semibold text-ink dark:text-white">{w.refurbisher?.name}</span></span>
        </p>
      </GlassCard>

      {accepted ? (
        <GlassCard as="section" aria-label="Accepted" className="space-y-4 !rounded-3xl !p-6 sm:!p-8">
          <h2 className="flex items-center gap-3 text-xl font-bold text-ink dark:text-white"><CheckCircle2 size={24} aria-hidden className="text-success" /> You accepted this request</h2>
          <p className="text-ink-muted dark:text-[#9FB2A7]">{w.refurbisher?.name} has been told that you can help. Watch your notifications and messages for their reply.</p>
          {sentMessage && <blockquote className="glass-subtle rounded-2xl p-4 text-ink dark:text-white">{sentMessage}</blockquote>}
          <div className="flex flex-wrap gap-3">
            <Link to="/dashboard/messages" className="btn btn-primary"><MessageCircle size={16} aria-hidden /> Open messages</Link>
            <Link to={BOARD} className="btn btn-glass">See more requests</Link>
          </div>
        </GlassCard>
      ) : blocked ? (
        <Alert variant="info">{blocked} <Link to={BOARD} className="font-semibold underline">Back to wanted devices</Link>.</Alert>
      ) : (
        <GlassCard as="form" onSubmit={submit} noValidate aria-label="Accept the request" className="space-y-5 !rounded-3xl !p-6 sm:!p-8">
          <div>
            <h2 className="text-lg font-bold text-ink dark:text-white">Tell them how you can help</h2>
            <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">A short message is optional, but it helps them decide quickly. Tap an idea to start with it.</p>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Message ideas">
            {IDEAS.map((idea) => (
              <li key={idea}>
                <button type="button" onClick={() => setMessage(idea)} className="glass-subtle rounded-full px-3.5 py-1.5 text-left text-sm font-medium text-ink transition hover:-translate-y-0.5 dark:text-white">{idea}</button>
              </li>
            ))}
          </ul>
          <TextField as="textarea" rows={4} label="Your message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} hint="For example what device you have, its condition, and when you are free." />
          <p className="flex items-start gap-2 text-xs text-ink-muted dark:text-[#9FB2A7]"><ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0" /> Accepting does not commit you to anything. You and the refurbisher agree the details together, and your address is only shared when you choose.</p>
          <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary" disabled={save.saving}>{save.saving ? 'Sending…' : 'Accept this request'}</button>
            <Link to={BOARD} className="btn btn-glass">Cancel</Link>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
