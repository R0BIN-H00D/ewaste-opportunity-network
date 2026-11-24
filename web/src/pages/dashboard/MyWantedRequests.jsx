import { useState } from 'react';
import { ClipboardList, Layers, MapPin, Pencil, Plus, Trash2, Users } from 'lucide-react';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import MessageButton from '../../components/chat/MessageButton';
import Modal from '../../components/ui/Modal';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { useCategories } from '../../hooks/useCategories';
import { refurbApi } from '../../services/refurbishmentApi';
import { CONDITIONS, labelOf } from '../../lib/devices';
import { friendlyMessage } from '../../utils/errors';

/** A refurbisher says what device they are looking for. */
function WantedDialog({ onClose, onDone, request }) {
  const editing = Boolean(request);
  const save = useSave();
  const categories = useCategories();
  const [f, setF] = useState({
    title: request?.title || '', category: request?.category?.slug || '', brand: request?.brand || '', minCondition: request?.minCondition || '',
    quantity: String(request?.quantity || 1), city: request?.city || '', notes: request?.notes || '',
  });
  const [problem, setProblem] = useState('');
  const set = (name) => (e) => setF((d) => ({ ...d, [name]: e.target.value }));

  const submit = async () => {
    if (f.title.trim().length < 3) return setProblem('Say what you are looking for (at least 3 letters).');
    setProblem('');
    const body = { title: f.title.trim(), quantity: Math.max(1, parseInt(f.quantity, 10) || 1) };
    // Adding leaves empty fields out; editing sends them empty so they are cleared.
    ['category', 'brand', 'minCondition', 'city', 'notes'].forEach((k) => { if (f[k].trim() || editing) body[k] = f[k].trim(); });
    const res = await save.run(() => (editing ? refurbApi.updateWanted(request._id, body) : refurbApi.addWanted(body)), editing ? 'Request updated' : 'Request added');
    if (res.ok) onDone(res.result);
    return res;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit request' : 'New request'}
      footer={<>
        <button type="button" className="btn btn-glass" onClick={onClose} disabled={save.saving}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Saving…' : editing ? 'Save changes' : 'Add request'}</button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{editing ? 'Change what you are looking for. People who already accepted keep their acceptance.' : 'Tell device owners what you are looking for. Open requests are visible to them.'}</p>
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

/** The devices this refurbisher is looking for: add one, close or reopen it, delete it, and see who offered to help. */
export default function MyWantedRequests() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showing, setShowing] = useState(null);
  const { data, error, loading, reload } = useFetch((signal) => refurbApi.wanted({ as: 'mine', limit: 50 }, signal), []);
  const items = data?.items || [];
  const open = items.filter((w) => w.status === 'open').length;
  const act = async (fn) => { try { await fn(); } finally { reload(); } };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section aria-label="About my requests" className="glass-strong flex flex-wrap items-start justify-between gap-6 rounded-3xl p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark"><ClipboardList size={26} /></span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink dark:text-white">My requests</h1>
            <p className="mt-1 max-w-xl text-ink-muted dark:text-[#9FB2A7]">Tell device owners and technicians what you are looking for. Open requests appear on their Wanted devices page.</p>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> New request</button>
      </section>

      {data && items.length > 0 && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" aria-live="polite">{items.length} {items.length === 1 ? 'request' : 'requests'} · {open} open</p>}

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load your requests" />
      ) : loading && !data ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60 !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardList} art="recycle" title="You have no requests yet" action={<button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> New request</button>}>
          Post the devices you are looking for and owners will offer them to you.
        </EmptyState>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="My requests">
          {items.map((w) => (
            <li key={w._id}>
              <article className="glass flex h-full flex-col gap-4 rounded-3xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary dark:text-primary-tint">{w.category?.name || 'Any device'}</span>
                  <Badge tone={w.status === 'open' ? 'green' : 'amber'}>{w.status === 'open' ? 'Open' : 'Closed'}</Badge>
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-snug text-ink dark:text-white">{w.title}</h2>
                  <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{[w.brand, w.minCondition && `${labelOf(CONDITIONS, w.minCondition)} or better`].filter(Boolean).join(' · ') || 'Anything'}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1 font-medium text-ink dark:bg-white/10 dark:text-white"><Layers size={14} aria-hidden /> Needs {w.quantity}</span>
                  {w.city && <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1 font-medium text-ink dark:bg-white/10 dark:text-white"><MapPin size={14} aria-hidden /> {w.city}</span>}
                </div>
                {w.notes && <p className="line-clamp-2 text-sm text-ink dark:text-[#E8F1EB]">{w.notes}</p>}
                <div className="mt-auto space-y-3 border-t border-black/5 pt-4 dark:border-white/10">
                  {w.responseCount > 0 ? (
                    <button type="button" className="btn btn-primary w-full justify-center" onClick={() => setShowing(showing === w._id ? null : w._id)}><Users size={16} aria-hidden /> {w.responseCount} accepted</button>
                  ) : (
                    <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Nobody has accepted yet</p>
                  )}
                  {showing === w._id && <Responders id={w._id} />}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-glass justify-center" aria-label={`Edit request ${w.title}`} onClick={() => setEditing(w)}><Pencil size={16} aria-hidden /> Edit</button>
                    <button type="button" className="btn btn-glass flex-1 justify-center" onClick={() => act(() => refurbApi.setWantedStatus(w._id, w.status === 'open' ? 'closed' : 'open'))}>{w.status === 'open' ? 'Close' : 'Reopen'}</button>
                    <button type="button" className="btn btn-glass justify-center" aria-label={`Delete request ${w.title}`} onClick={() => act(() => refurbApi.deleteWanted(w._id))}><Trash2 size={16} aria-hidden /> Delete</button>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {adding && <WantedDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {editing && <WantedDialog request={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
