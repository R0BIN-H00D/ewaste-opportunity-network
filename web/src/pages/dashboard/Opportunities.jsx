import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, Plus, Recycle, Search, X } from 'lucide-react';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import MessageButton from '../../components/chat/MessageButton';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import TextField from '../../components/ui/TextField';
import { DeviceCardSkeleton, Thumb } from '../../components/devices/DeviceCard';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { useCategories } from '../../hooks/useCategories';
import { refurbApi } from '../../services/refurbishmentApi';
import { CONDITIONS, labelOf, placeLabel } from '../../lib/devices';
import { applyFieldErrors, friendlyMessage } from '../../utils/errors';

const KEYS = ['q', 'category', 'condition', 'city'];

/** A refurbisher says what device they are looking for. */
function WantedDialog({ onClose, onDone }) {
  const save = useSave();
  const categories = useCategories();
  const [f, setF] = useState({ title: '', category: '', brand: '', minCondition: '', quantity: '1', city: '', notes: '' });
  const [problem, setProblem] = useState('');
  const set = (name) => (e) => setF((d) => ({ ...d, [name]: e.target.value }));

  const submit = async () => {
    if (f.title.trim().length < 3) return setProblem('Say what you are looking for (at least 3 letters).');
    setProblem('');
    const body = { title: f.title.trim(), quantity: Math.max(1, parseInt(f.quantity, 10) || 1) };
    ['category', 'brand', 'minCondition', 'city', 'notes'].forEach((k) => { if (f[k].trim()) body[k] = f[k].trim(); });
    const res = await save.run(() => refurbApi.addWanted(body), 'Request added');
    if (res.ok) onDone(res.result);
    return res;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New request"
      footer={<>
        <button type="button" className="btn btn-glass" onClick={onClose} disabled={save.saving}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Saving…' : 'Add request'}</button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Tell device owners what you are looking for. Open requests are visible to them.</p>
        <TextField label="What are you looking for?" value={f.title} onChange={set('title')} error={problem} placeholder="Used laptops, any brand" maxLength={120} />
        <TextField as="select" label="Category (optional)" value={f.category} onChange={set('category')}>
          <option value="">Any category</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </TextField>
        <TextField label="Brand (optional)" value={f.brand} onChange={set('brand')} maxLength={60} />
        <TextField as="select" label="Worst condition you accept (optional)" value={f.minCondition} onChange={set('minCondition')}>
          <option value="">Any condition</option>
          {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField label="How many?" type="number" min="1" value={f.quantity} onChange={set('quantity')} />
        <TextField label="City (optional)" value={f.city} onChange={set('city')} maxLength={80} />
        <TextField as="textarea" rows={3} label="Notes (optional)" value={f.notes} onChange={set('notes')} maxLength={1000} />
        <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
      </div>
    </Modal>
  );
}

/** The people who accepted one of my requests, each with a Message button. */
function Responders({ id }) {
  const { data, error } = useFetch((signal) => refurbApi.wantedResponses(id, signal), [id]);
  if (error) return <p role="alert" className="text-sm text-danger">Could not load who accepted.</p>;
  if (!data) return <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Loading…</p>;
  return (
    <ul className="space-y-2 rounded-xl bg-black/5 p-3 dark:bg-white/5">
      {data.map((r) => (
        <li key={r._id} className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink dark:text-white">{r.responder?.name} <span className="text-xs text-ink-muted dark:text-[#9FB2A7]">({r.responder?.role === 'technician' ? 'technician' : 'device owner'})</span></p>
            {r.message && <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{r.message}</p>}
          </div>
          <MessageButton contextType="wanted" contextId={r._id} />
        </li>
      ))}
    </ul>
  );
}

/** My open and closed requests, with close / reopen / delete. */
function MyWanted({ refreshKey }) {
  const { data, reload } = useFetch((signal) => refurbApi.wanted({ as: 'mine', limit: 50 }, signal), [refreshKey]);
  const [showing, setShowing] = useState(null);
  const items = data?.items || [];
  if (items.length === 0) return null;
  const act = async (fn) => { try { await fn(); } finally { reload(); } };
  return (
    <section aria-label="My requests" className="glass space-y-2 p-4">
      <h2 className="text-lg font-bold text-ink dark:text-white">My requests</h2>
      <ul className="divide-y divide-black/5 dark:divide-white/10">
        {items.map((w) => (
          <li key={w._id} className="flex flex-wrap items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink dark:text-white">{w.title} <span className="text-xs text-ink-muted dark:text-[#9FB2A7]">× {w.quantity}</span></p>
              <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{[w.category?.name, w.brand, w.minCondition && labelOf(CONDITIONS, w.minCondition), w.city].filter(Boolean).join(' · ') || 'Anything'}</p>
            </div>
            {w.responseCount > 0 && <button type="button" className="btn btn-glass" onClick={() => setShowing(showing === w._id ? null : w._id)}>{w.responseCount} accepted</button>}
            <Badge tone={w.status === 'open' ? 'green' : 'amber'}>{w.status === 'open' ? 'Open' : 'Closed'}</Badge>
            <button type="button" className="btn btn-glass" onClick={() => act(() => refurbApi.setWantedStatus(w._id, w.status === 'open' ? 'closed' : 'open'))}>{w.status === 'open' ? 'Close' : 'Reopen'}</button>
            <button type="button" className="btn btn-glass" aria-label={`Delete request ${w.title}`} onClick={() => act(() => refurbApi.deleteWanted(w._id))}>Delete</button>
            {showing === w._id && <div className="basis-full"><Responders id={w._id} /></div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function OfferDialog({ listing, onClose, onDone }) {
  const save = useSave();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');

  const submit = async () => {
    const value = amount.trim() === '' ? 0 : Number(amount);
    if (Number.isNaN(value) || value < 0) return setProblem('Enter an amount of 0 or more.');
    setProblem('');
    const res = await save.run(() => refurbApi.offer({ listingId: listing._id, amount: value, ...(message.trim() ? { message: message.trim() } : {}) }), 'Offer sent');
    if (res.ok) onDone(res.result);
    else applyFieldErrors(res.error, (name, { message: m }) => { if (name === 'amount') setProblem(m); }, ['amount']);
    return res;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Make an offer"
      footer={<>
        <button type="button" className="btn btn-glass" onClick={onClose} disabled={save.saving}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Sending…' : 'Send offer'}</button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{listing.title}. If the owner accepts you arrange the collection together. Any payment is made directly between you; the platform never handles money.</p>
        <TextField label="What will you pay the owner? (₹, optional)" type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} error={problem} hint="Leave empty to offer a free collection." />
        <TextField as="textarea" rows={3} label="Message for the owner (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
        <Alert variant="error">{save.status === 'error' && !problem ? friendlyMessage(save.error) : ''}</Alert>
      </div>
    </Modal>
  );
}

/** Reusable devices owners have listed for refurbishment (FR-MKT-001). Only verified refurbishers can see this. */
export default function Opportunities() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const [draft, setDraft] = useState(filters);
  const [offering, setOffering] = useState(null);
  const [adding, setAdding] = useState(false);
  const [wantedKey, setWantedKey] = useState(0);
  const key = JSON.stringify(filters);
  useEffect(() => setDraft(filters), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, loading, reload } = useFetch((signal) => refurbApi.opportunities({ ...filters, page, limit: 12 }, signal), [key, page]);
  const items = data?.items || [];
  const active = KEYS.some((k) => filters[k]);

  const apply = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  const set = (name) => (e) => setDraft((d) => ({ ...d, [name]: e.target.value }));
  const setNow = (name) => (e) => {
    const next = { ...draft, [name]: e.target.value };
    setDraft(next);
    apply(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Devices to refurbish</h1>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> New request</button>
          <Link to="/dashboard/refurbishment" className="btn btn-glass">My jobs</Link>
        </div>
      </div>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Reusable devices their owners want refurbished. Make an offer; the owner chooses one refurbisher and the exact address is shared only with that person.</p>

      <MyWanted refreshKey={wantedKey} />

      <form role="search" aria-label="Search devices" noValidate onSubmit={(e) => { e.preventDefault(); apply(draft); }} className="glass grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
        <TextField label="Search" type="search" value={draft.q} onChange={set('q')} placeholder="Laptop, tablet, Lenovo…" maxLength={100} />
        <TextField as="select" label="Category" value={draft.category} onChange={setNow('category')}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </TextField>
        <TextField as="select" label="Condition" value={draft.condition} onChange={setNow('condition')}>
          <option value="">Any condition</option>
          {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField label="City" value={draft.city} onChange={set('city')} maxLength={80} />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary"><Search size={16} aria-hidden /> Search</button>
          {active && <button type="button" className="btn btn-glass" aria-label="Clear all filters" onClick={() => setParams({})}><X size={16} aria-hidden /> Clear</button>}
        </div>
      </form>

      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" aria-live="polite">
        {loading && !data ? 'Loading devices…' : data ? `${data.meta.total} ${data.meta.total === 1 ? 'device' : 'devices'} available` : ''}
      </p>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load devices" />
      ) : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>{Array.from({ length: 3 }, (_, i) => <DeviceCardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Recycle} art="recycle" title={active ? 'No devices match your search' : 'No devices to refurbish right now'} action={active ? <button type="button" className="btn btn-glass" onClick={() => setParams({})}>Clear filters</button> : null}>
          {active ? 'Try fewer filters or a different keyword.' : 'When an owner lists a device for refurbishment it appears here.'}
        </EmptyState>
      ) : (
        <>
          <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
            {items.map((l) => (
              <article key={l._id} className="glass flex flex-col overflow-hidden">
                <Thumb listing={l} className="aspect-[4/3]" />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <Badge tone={l.condition === 'fully_working' ? 'green' : 'amber'}>{labelOf(CONDITIONS, l.condition)}</Badge>
                  <h3 className="text-base font-bold leading-snug text-ink dark:text-white">{l.title}</h3>
                  <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{[l.category?.name, l.brand, l.model].filter(Boolean).join(' · ')}</p>
                  {placeLabel(l) && <p className="flex items-center gap-1 text-xs text-ink-muted dark:text-[#9FB2A7]"><MapPin size={14} aria-hidden />{placeLabel(l)}</p>}
                  <div className="mt-auto pt-2">
                    {l.hasOffered
                      ? <Badge tone="blue">Offer sent</Badge>
                      : <button type="button" className="btn btn-primary" onClick={() => setOffering(l)} aria-label={`Make an offer on ${l.title}`}>Make an offer</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(n > 1 ? { page: String(n) } : {}) })} />
        </>
      )}

      {adding && <WantedDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); setWantedKey((k) => k + 1); }} />}

      {offering && (
        <OfferDialog
          listing={offering}
          onClose={() => setOffering(null)}
          onDone={(job) => navigate(`/dashboard/refurbishment/${job._id}`, { state: { flash: 'Your offer was sent to the owner.' } })}
        />
      )}
    </div>
  );
}
