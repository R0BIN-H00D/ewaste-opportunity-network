import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Handshake, MapPin, Send, ShieldCheck, Truck } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { assetUrl } from '../../services/api';
import { deviceApi } from '../../services/deviceApi';
import { refurbApi } from '../../services/refurbishmentApi';
import { CONDITIONS, labelOf, photosOf, placeLabel } from '../../lib/devices';
import { applyFieldErrors, friendlyMessage } from '../../utils/errors';

const BOARD = '/dashboard/opportunities';
const AMOUNTS = [500, 1000, 2000, 5000];
const IDEAS = [
  'I can collect it this week.',
  'We refurbish and resell with a warranty.',
  'I can come to you with a pickup van.',
];
const STEPS = [
  [Send, 'You send the offer', 'The owner sees your price and message.'],
  [Handshake, 'The owner chooses one', 'They pick a single refurbisher and tell you.'],
  [Truck, 'You arrange the pickup', 'Only then is the exact address shared with you.'],
];

/** The page where a refurbisher makes an offer on one device: the device on the left, the offer on the right. */
export default function OfferPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const save = useSave();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [at, setAt] = useState(0);
  const { data: l, error, loading, reload } = useFetch((signal) => deviceApi.get(id, signal), [id]);

  if (loading && !l) return <div className="mx-auto max-w-6xl space-y-5" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-80 w-full !rounded-3xl" /></div>;
  if (error && !l) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <ErrorState error={missing ? { message: 'This device does not exist or is no longer available.' } : error} title={missing ? 'Device not found' : 'Could not load this device'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to={BOARD} className="font-semibold text-primary underline dark:text-primary-tint">Back to devices to refurbish</Link></p>
      </div>
    );
  }

  const photos = photosOf(l);
  const main = photos[Math.min(at, photos.length - 1)];
  const place = placeLabel(l);
  const note = [l.description, l.conditionNote].filter(Boolean).join('\n\n');

  const submit = async (e) => {
    e.preventDefault();
    const value = amount.trim() === '' ? 0 : Number(amount);
    if (Number.isNaN(value) || value < 0) return setProblem('Enter an amount of 0 or more.');
    setProblem('');
    const res = await save.run(() => refurbApi.offer({ listingId: l._id, amount: value, ...(message.trim() ? { message: message.trim() } : {}) }), 'Offer sent');
    if (res.ok) navigate(`/dashboard/refurbishment/${res.result._id}`, { state: { flash: 'Your offer was sent to the owner.' } });
    else applyFieldErrors(res.error, (name, { message: m }) => { if (name === 'amount') setProblem(m); }, ['amount']);
    return res;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to={BOARD} className="glass-subtle inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Devices to refurbish</Link>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink dark:text-white">Make an offer</h1>
        <p className="mt-1 text-ink-muted dark:text-[#9FB2A7]">Tell the owner what you will pay and when you can collect. They choose one refurbisher.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
        <GlassCard as="section" aria-label="The device" className="space-y-5 overflow-hidden !rounded-3xl !p-0 lg:col-span-2">
          <div className="space-y-3 p-3">
            {main ? (
              <img src={assetUrl(main.url)} alt={l.title} className="aspect-[4/3] w-full rounded-2xl object-cover" />
            ) : (
              <div role="img" aria-label="No photo" className="grid aspect-[4/3] place-items-center rounded-2xl bg-primary/5 text-sm text-ink-muted">No photo</div>
            )}
            {photos.length > 1 && (
              <ul className="flex flex-wrap gap-2" aria-label="Device photos">
                {photos.map((p, i) => (
                  <li key={p.publicId || p.url}>
                    <button type="button" onClick={() => setAt(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === at ? 'true' : undefined} className={`overflow-hidden rounded-xl ring-2 transition ${i === at ? 'ring-primary dark:ring-primary-tint' : 'opacity-70 ring-transparent hover:opacity-100'}`}>
                      <img src={assetUrl(p.url)} alt="" className="h-14 w-16 object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3 px-6 pb-6">
            <Badge tone={l.condition === 'fully_working' ? 'green' : 'amber'}>{labelOf(CONDITIONS, l.condition)}</Badge>
            <h2 className="text-xl font-bold leading-snug text-ink dark:text-white">{l.title}</h2>
            <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{[l.category?.name, l.brand, l.model].filter(Boolean).join(' · ')}</p>
            {place && <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]"><MapPin size={16} aria-hidden className="shrink-0" /> {place}</p>}
            {l.device?.ageYears !== undefined && <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]"><CalendarClock size={16} aria-hidden className="shrink-0" /> About {l.device.ageYears} {l.device.ageYears === 1 ? 'year' : 'years'} old</p>}
            {note && <p className="whitespace-pre-line rounded-2xl bg-black/[0.03] p-4 text-sm leading-relaxed text-ink dark:bg-white/5 dark:text-[#E8F1EB]">{note}</p>}
          </div>
        </GlassCard>

        <div className="space-y-6 lg:col-span-3">
          <GlassCard as="form" onSubmit={submit} noValidate aria-label="Your offer" className="space-y-6 !rounded-3xl !p-6 sm:!p-8">
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-bold text-ink dark:text-white">What will you pay the owner?</h2>
                <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Optional. Leave it empty to offer a free collection.</p>
              </div>
              <TextField label="What will you pay the owner? (₹, optional)" type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} error={problem} />
              <ul className="flex flex-wrap gap-2" aria-label="Quick amounts">
                <li><button type="button" onClick={() => setAmount('')} className="glass-subtle rounded-full px-4 py-1.5 text-sm font-semibold text-ink dark:text-white">Free collection</button></li>
                {AMOUNTS.map((a) => (
                  <li key={a}><button type="button" onClick={() => setAmount(String(a))} className="glass-subtle rounded-full px-4 py-1.5 text-sm font-semibold text-ink dark:text-white">₹{a.toLocaleString('en-IN')}</button></li>
                ))}
              </ul>
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-bold text-ink dark:text-white">Add a message</h2>
                <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">A short note helps the owner trust you. Tap an idea to start with it.</p>
              </div>
              <ul className="flex flex-wrap gap-2" aria-label="Message ideas">
                {IDEAS.map((idea) => (
                  <li key={idea}><button type="button" onClick={() => setMessage(idea)} className="glass-subtle rounded-full px-3.5 py-1.5 text-left text-sm font-medium text-ink dark:text-white">{idea}</button></li>
                ))}
              </ul>
              <TextField as="textarea" rows={4} label="Message for the owner (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
            </section>

            <Alert variant="error">{save.status === 'error' && !problem ? friendlyMessage(save.error) : ''}</Alert>
            <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-5 dark:border-white/10">
              <button type="submit" className="btn btn-primary !px-8" disabled={save.saving}><Send size={16} aria-hidden /> {save.saving ? 'Sending…' : 'Send offer'}</button>
              <Link to={BOARD} className="btn btn-glass">Cancel</Link>
            </div>
            <p className="flex items-start gap-2 text-xs text-ink-muted dark:text-[#9FB2A7]"><ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0" /> Any payment is made directly between you and the owner. The platform never handles money.</p>
          </GlassCard>

          <GlassCard as="section" aria-label="What happens next" className="!rounded-3xl !p-6">
            <h2 className="mb-4 text-lg font-bold text-ink dark:text-white">What happens next</h2>
            <ol className="grid gap-3 sm:grid-cols-3">
              {STEPS.map(([icon, title, text], n) => {
                const Icon = icon;
                return (
                  <li key={title} className="rounded-2xl bg-black/[0.03] p-4 dark:bg-white/5">
                    <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary dark:text-primary-tint"><Icon size={18} /></span>
                    <p className="mt-3 text-sm font-semibold text-ink dark:text-white">{n + 1}. {title}</p>
                    <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{text}</p>
                  </li>
                );
              })}
            </ol>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
