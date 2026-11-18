import { useState } from 'react';
import { Check, MapPin, Search } from 'lucide-react';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { refurbApi } from '../../services/refurbishmentApi';
import { CONDITIONS, labelOf } from '../../lib/devices';
import { friendlyMessage } from '../../utils/errors';

function AcceptDialog({ request, onClose, onDone }) {
  const save = useSave();
  const [message, setMessage] = useState('');
  const submit = async () => {
    const res = await save.run(() => refurbApi.respondWanted(request._id, message.trim()), 'Accepted');
    if (res.ok) onDone();
    return res;
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Accept this request"
      footer={<>
        <button type="button" className="btn btn-glass" onClick={onClose} disabled={save.saving}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Sending…' : 'Accept'}</button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{request.refurbisher?.name} is looking for: {request.title}. They will be told you can help and can message you.</p>
        <TextField as="textarea" rows={3} label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} hint="For example what device you have." />
        <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
      </div>
    </Modal>
  );
}

/** Devices refurbishers are looking for. Device owners and technicians can accept the ones they can help with. */
export default function WantedBoard() {
  const [page, setPage] = useState(1);
  const [accepting, setAccepting] = useState(null);
  const { data, error, loading, reload } = useFetch((signal) => refurbApi.wanted({ as: 'board', page, limit: 12 }, signal), [page]);
  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Wanted devices</h1>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Refurbishers post the devices they are looking for. If you can help, accept the request and they will get in touch with you.</p>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load requests" />
      ) : loading && !data ? (
        <p aria-busy className="text-sm text-ink-muted dark:text-[#9FB2A7]">Loading requests…</p>
      ) : items.length === 0 ? (
        <EmptyState icon={Search} art="recycle" title="No requests right now">When a refurbisher posts a device they are looking for it appears here.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((w) => (
              <article key={w._id} className="glass flex flex-col gap-2 p-4">
                <h3 className="text-base font-bold text-ink dark:text-white">{w.title}</h3>
                <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{[w.category?.name, w.brand, w.minCondition && `${labelOf(CONDITIONS, w.minCondition)} or better`, `Qty ${w.quantity}`].filter(Boolean).join(' · ')}</p>
                {w.city && <p className="flex items-center gap-1 text-xs text-ink-muted dark:text-[#9FB2A7]"><MapPin size={14} aria-hidden />{w.city}</p>}
                {w.notes && <p className="text-sm text-ink dark:text-white">{w.notes}</p>}
                <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Wanted by {w.refurbisher?.name}</p>
                <div className="mt-auto pt-2">
                  {w.hasResponded
                    ? <Badge tone="blue"><Check size={12} aria-hidden /> Accepted</Badge>
                    : <button type="button" className="btn btn-primary" onClick={() => setAccepting(w)} aria-label={`Accept request ${w.title}`}>Accept</button>}
                </div>
              </article>
            ))}
          </div>
          <Pagination page={data.meta.page} pages={data.meta.pages} onChange={setPage} />
        </>
      )}

      {accepting && <AcceptDialog request={accepting} onClose={() => setAccepting(null)} onDone={() => { setAccepting(null); reload(); }} />}
    </div>
  );
}
