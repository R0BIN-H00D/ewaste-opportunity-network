import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Flag } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import ReasonDialog from '../../components/admin/ReasonDialog';
import { useFetch } from '../../hooks/useFetch';
import { adminReportApi } from '../../services/adminApi';
import { REPORT_REASON, REPORT_STATUS, REPORT_TARGET, monitorStatusLabel } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

const TAKE_DOWN = {
  listing: { label: 'Remove listing', title: 'Remove this listing?', intro: 'It disappears from the public pages and the owner is told why. Other reports about it are closed with this one.', confirm: 'Remove listing' },
  product: { label: 'Remove product', title: 'Remove this product?', intro: 'It disappears from the marketplace and the seller is told why. Other reports about it are closed with this one.', confirm: 'Remove product' },
  review: { label: 'Hide review', title: 'Hide this review?', intro: 'It no longer shows or counts towards the rating, and the reviewer is told why. Other reports about it are closed with this one.', confirm: 'Hide review' },
};

/** Where an administrator can look at the item itself. A review has no page of its own, so it points to the reviews list. */
const itemLink = (t) => ({
  listing: `/devices/${t.id}`,
  product: `/marketplace/${t.id}`,
  user: `/dashboard/admin/users/${t.id}`,
  review: '/dashboard/admin/reviews?reported=true',
}[t.type]);
const itemLinkLabel = (t) => ({ listing: 'View listing', product: 'View product', user: 'Open account', review: 'See in reviews' }[t.type]);

function Row({ item, onAct }) {
  const [statusLabel, statusTone] = REPORT_STATUS[item.status] || [item.status, 'neutral'];
  const t = item.target;
  const takeDown = TAKE_DOWN[t.type];
  return (
    <GlassCard as="article" className="space-y-2 !p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-ink dark:text-white">{REPORT_REASON[item.reason] || item.reason}</h2>
        <Badge tone="neutral">{REPORT_TARGET[t.type] || t.type}</Badge>
        <Badge tone={statusTone}>{statusLabel}</Badge>
        {item.reportsOnItem > 1 && <Badge tone="amber">{plural(item.reportsOnItem, 'report')} on this item</Badge>}
      </div>

      <div className="rounded-xl border border-white/30 bg-white/30 px-3 py-2 text-sm dark:bg-white/5">
        <p className="font-semibold text-ink dark:text-white">{t.title}</p>
        {t.exists && (
          <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
            {[t.status ? monitorStatusLabel(t.status) : '', t.owner ? `by ${t.owner}` : '', t.role ? monitorStatusLabel(t.role) : ''].filter(Boolean).join(' · ')}
          </p>
        )}
        {t.excerpt && <p className="mt-1 text-ink dark:text-[#E8F1EB]">{t.excerpt}</p>}
      </div>

      {item.details && <p className="text-sm text-ink dark:text-[#E8F1EB]">“{item.details}”</p>}
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Reported by {item.reporter?.name || 'a removed account'} · {formatDate(item.createdAt)}</p>
      {item.status !== 'open' && (
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Decided {formatDate(item.reviewedAt)}{item.decisionNote ? `: ${item.decisionNote}` : ''}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {t.exists && <Link to={itemLink(t)} className="btn btn-glass !px-4 !py-2 text-sm">{itemLinkLabel(t)}</Link>}
        {item.actions.includes('take_down') && takeDown && (
          <button type="button" className="btn btn-glass !px-4 !py-2 text-sm text-danger" onClick={() => onAct(item, 'take_down')}>{takeDown.label}</button>
        )}
        {item.actions.includes('resolve') && <button type="button" className="btn btn-glass !px-4 !py-2 text-sm" onClick={() => onAct(item, 'resolve')}>Mark as handled</button>}
        {item.actions.includes('dismiss') && <button type="button" className="btn btn-glass !px-4 !py-2 text-sm" onClick={() => onAct(item, 'dismiss')}>Dismiss</button>}
      </div>
    </GlassCard>
  );
}

/** What people flagged. Take the item down, note it was dealt with elsewhere, or dismiss the report. */
export default function Reports() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const targetType = params.get('targetType') || '';
  const reason = params.get('reason') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const [dialog, setDialog] = useState(null);
  const { data, error, loading, reload } = useFetch((signal) => adminReportApi.list({ status, targetType, reason, page, limit: 10 }, signal), [status, targetType, reason, page]);
  const items = data?.items || [];
  const filtered = !!(status || targetType || reason);
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  const current = { status, targetType, reason };
  const done = () => { setDialog(null); reload(); };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Reports</h1>
      <div className="flex flex-wrap items-end gap-3">
        <TextField as="select" label="Show" value={status} onChange={(e) => set({ ...current, status: e.target.value })} className="w-44">
          <option value="">Waiting</option>
          <option value="actioned">Handled</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </TextField>
        <TextField as="select" label="About" value={targetType} onChange={(e) => set({ ...current, targetType: e.target.value })} className="w-40">
          <option value="">Anything</option>
          {Object.entries(REPORT_TARGET).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField as="select" label="Reason" value={reason} onChange={(e) => set({ ...current, reason: e.target.value })} className="w-48">
          <option value="">Any reason</option>
          {Object.entries(REPORT_REASON).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        {filtered && <button type="button" className="btn btn-glass" onClick={() => setParams({})}>Clear</button>}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load reports" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Flag} title={filtered ? 'No report matches these filters' : 'No reports are waiting'}>
          {filtered ? 'Try another kind or reason.' : 'When someone flags a listing, product, review or person, it shows up here.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" role="status">{plural(data.meta.total, 'report')}</p>
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((r) => <li key={r._id}><Row item={r} onAct={(item, action) => setDialog({ item, action })} /></li>)}</ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ ...current, ...(n > 1 ? { page: String(n) } : {}) })} />}

      {dialog?.action === 'take_down' && TAKE_DOWN[dialog.item.target.type] && (
        <ReasonDialog
          title={TAKE_DOWN[dialog.item.target.type].title} intro={TAKE_DOWN[dialog.item.target.type].intro} confirmLabel={TAKE_DOWN[dialog.item.target.type].confirm}
          danger required minLength={5} field="Reason" hint="The owner reads this."
          submit={(text) => adminReportApi.decide(dialog.item._id, { decision: 'take_down', reason: text })}
          onClose={() => setDialog(null)} onDone={done}
        />
      )}
      {dialog?.action === 'resolve' && (
        <ReasonDialog
          title="Mark this report as handled?" intro="Use this when the problem was dealt with another way, for example by speaking to the owner. The item itself is not changed."
          confirmLabel="Mark as handled" required minLength={5} field="What was done" hint="Kept in the record."
          submit={(text) => adminReportApi.decide(dialog.item._id, { decision: 'resolve', reason: text })}
          onClose={() => setDialog(null)} onDone={done}
        />
      )}
      {dialog?.action === 'dismiss' && (
        <ReasonDialog
          title="Dismiss this report?" intro="Nothing is changed. The person who reported it is told that no action was needed."
          confirmLabel="Dismiss report" field="Note" hint="Kept in the record."
          submit={(text) => adminReportApi.decide(dialog.item._id, { decision: 'dismiss', ...(text ? { reason: text } : {}) })}
          onClose={() => setDialog(null)} onDone={done}
        />
      )}
    </div>
  );
}
