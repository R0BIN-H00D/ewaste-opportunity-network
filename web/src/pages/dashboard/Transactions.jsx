import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ReceiptText } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { transactionApi } from '../../services/repairApi';
import { formatDate, formatMoney } from '../../lib/requests';
import { friendlyMessage } from '../../utils/errors';

const TABS = [['', 'All'], ['received', 'Received'], ['paid', 'Paid']];
const STATUS = { recorded: ['Recorded', 'amber'], confirmed: ['Confirmed', 'green'], disputed: ['Disputed', 'red'] };

function Stat({ label, value, note }) {
  return (
    <GlassCard className="!p-4">
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{label}</p>
      <p className="font-numeric text-2xl font-extrabold text-primary dark:text-primary-tint">{value}</p>
      {note && <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{note}</p>}
    </GlassCard>
  );
}

export default function Transactions() {
  const [params, setParams] = useSearchParams();
  const direction = params.get('direction') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const [pending, setPending] = useState(null);
  const [reference, setReference] = useState('');
  const [flash, setFlash] = useState('');
  const save = useSave();

  const summary = useFetch((signal) => transactionApi.summary(signal), []);
  const list = useFetch((signal) => transactionApi.list({ direction, page, limit: 10 }, signal), [direction, page]);
  const items = list.data?.items || [];
  const s = summary.data;

  const confirm = async () => {
    const res = await save.run(() => transactionApi.confirm(pending._id, reference.trim() ? { reference: reference.trim() } : {}), 'Payment confirmed');
    if (res.ok) {
      setFlash('Payment marked as received.');
      setPending(null);
      setReference('');
      list.reload();
      summary.reload();
    }
  };
  const close = () => {
    setPending(null);
    setReference('');
    save.reset();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Transaction history</h1>
      <Alert variant="info">Payments are made directly between you and the other person. This page only keeps a record; the platform never handles your money.</Alert>
      <Alert variant="success">{flash}</Alert>

      {s && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Received" value={formatMoney(s.received.total)} note={`${s.received.count} ${s.received.count === 1 ? 'payment' : 'payments'}`} />
          <Stat label="Paid" value={formatMoney(s.paid.total)} note={`${s.paid.count} ${s.paid.count === 1 ? 'payment' : 'payments'}`} />
          <Stat label="Waiting for your confirmation" value={String(s.awaitingConfirmation)} note="Payments you were paid but have not confirmed" />
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter transactions">
        {TABS.map(([value, label]) => (
          <button
            key={value || 'all'}
            type="button"
            role="tab"
            aria-selected={direction === value}
            onClick={() => setParams(value ? { direction: value } : {})}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${direction === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted hover:text-ink dark:hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} title="Could not load your transactions" />
      ) : list.loading && !list.data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No transactions yet" action={<Link to="/browse" className="btn btn-glass">Browse devices</Link>}>
          Completed repairs and other confirmed services will be listed here.
        </EmptyState>
      ) : (
        <ul className={`space-y-3 ${list.loading ? 'opacity-60' : ''}`}>
          {items.map((t) => {
            const [statusLabel, tone] = STATUS[t.status] || [t.status, 'neutral'];
            const free = t.type === 'donation';
            return (
              <li key={t._id}>
                <GlassCard as="article" className="flex flex-col gap-3 !p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-ink dark:text-white">
                        {t.subject?.link ? <Link to={t.subject.link} className="hover:underline">{t.subject.title}</Link> : t.subject?.title}
                      </h2>
                      <Badge tone={tone}>{statusLabel}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">
                      {free ? (t.direction === 'received' ? 'Donated to' : 'Received from') : t.direction === 'received' ? 'From' : 'To'} {t.counterparty?.name || 'someone'} · {formatDate(t.createdAt)} · {free ? 'Free donation, no payment' : 'Offline payment'}{t.reference ? ` · Ref ${t.reference}` : ''}
                    </p>
                  </div>
                  <p className="font-numeric text-lg font-bold text-ink dark:text-white">
                    {free ? 'Free' : (
                      <>
                        <span className="sr-only">{t.direction === 'received' ? 'Received ' : 'Paid '}</span>
                        {t.direction === 'received' ? '+' : '−'}{formatMoney(t.amount)}
                      </>
                    )}
                  </p>
                  {t.canConfirm && <button type="button" className="btn btn-glass whitespace-nowrap" onClick={() => setPending(t)}>Confirm payment received</button>}
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
      {list.data?.meta && <Pagination page={list.data.meta.page} pages={list.data.meta.pages} onChange={(n) => setParams({ ...(direction ? { direction } : {}), ...(n > 1 ? { page: String(n) } : {}) })} />}

      <ConfirmDialog open={Boolean(pending)} title="Confirm payment received?" confirmLabel="Confirm payment" busy={save.saving} onConfirm={confirm} onCancel={close}>
        <p className="mb-3 text-sm text-ink dark:text-[#E8F1EB]">Only confirm once the {pending ? formatMoney(pending.amount) : ''} has reached you.</p>
        <TextField label="Payment reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} hint="For example a UPI or bank reference." />
        <Alert variant="error" className="mt-3">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
      </ConfirmDialog>
    </div>
  );
}
