import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import ReasonDialog from '../../components/admin/ReasonDialog';
import { useFetch } from '../../hooks/useFetch';
import { adminReviewApi } from '../../services/adminApi';
import { REVIEW_STATUS, ROLE_LABEL, reviewStatusLabel, reviewStatusTone } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

// What each server-offered action does. Hiding and removing need a reason, because the reviewer is told.
const ACTION = {
  hide: { label: 'Hide', status: 'hidden', required: true, title: 'Hide this review?', intro: 'It no longer shows on the provider’s profile or counts towards their rating. The reviewer is told why.', confirm: 'Hide review', danger: true },
  remove: { label: 'Remove', status: 'removed', required: true, title: 'Remove this review?', intro: 'It no longer shows or counts. The review stays on record, so the same service cannot be reviewed again.', confirm: 'Remove review', danger: true },
  restore: { label: 'Restore', status: 'visible', required: false, title: 'Restore this review?', intro: 'It shows on the profile again and counts towards the rating.', confirm: 'Restore review' },
};

function Row({ item, onAct }) {
  const detail = [['Quality', item.quality], ['Communication', item.communication], ['Timeliness', item.timeliness]].filter(([, v]) => v).map(([l, v]) => `${l} ${v}/5`).join(' · ');
  return (
    <GlassCard as="article" className="space-y-2 !p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1 text-base font-bold text-ink dark:text-white"><Star size={16} aria-hidden /> {item.rating} out of 5</h2>
        <Badge tone={reviewStatusTone(item.status)}>{reviewStatusLabel(item.status)}</Badge>
        {item.openReports > 0 && <Badge tone="amber">{plural(item.openReports, 'report')} waiting</Badge>}
      </div>
      {item.comment ? <p className="text-sm text-ink dark:text-[#E8F1EB]">{item.comment}</p> : <p className="text-sm italic text-ink-muted dark:text-[#9FB2A7]">No comment written.</p>}
      {detail && <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{detail}</p>}
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
        By {item.reviewer?.name || 'Removed account'} about {item.target?.name || 'Removed account'}{item.target?.role ? ` (${ROLE_LABEL[item.target.role] || item.target.role})` : ''} · {formatDate(item.createdAt)}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {item.actions.filter((a) => ACTION[a]).map((a) => (
          <button key={a} type="button" className={`btn btn-glass !px-4 !py-2 text-sm ${ACTION[a].danger ? 'text-danger' : ''}`} onClick={() => onAct(item, a)} aria-label={`${ACTION[a].label} the ${item.rating}-star review by ${item.reviewer?.name || 'a removed account'}`}>
            {ACTION[a].label}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

/** Reviews across the platform. Administrators can hide, remove and restore them, never edit them. */
export default function Reviews() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const rating = params.get('rating') || '';
  const reported = params.get('reported') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const [dialog, setDialog] = useState(null);
  const { data, error, loading, reload } = useFetch((signal) => adminReviewApi.list({ status, rating, reported, page, limit: 10 }, signal), [status, rating, reported, page]);
  const items = data?.items || [];
  const filtered = !!(status || rating || reported);
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  const current = { status, rating, reported };
  const spec = dialog ? ACTION[dialog.action] : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Reviews</h1>
      <div className="flex flex-wrap items-end gap-3">
        <TextField as="select" label="Show" value={status} onChange={(e) => set({ ...current, status: e.target.value })} className="w-44">
          <option value="">All reviews</option>
          {Object.entries(REVIEW_STATUS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField as="select" label="Rating" value={rating} onChange={(e) => set({ ...current, rating: e.target.value })} className="w-36">
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} out of 5</option>)}
        </TextField>
        <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium text-ink dark:text-white">
          <input type="checkbox" checked={reported === 'true'} onChange={(e) => set({ ...current, reported: e.target.checked ? 'true' : '' })} /> Reported only
        </label>
        {filtered && <button type="button" className="btn btn-glass" onClick={() => setParams({})}>Clear</button>}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load reviews" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Star} title={filtered ? 'No review matches these filters' : 'There are no reviews yet'}>
          {filtered ? 'Try another rating or status.' : 'Reviews appear here as customers rate completed work.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" role="status">{plural(data.meta.total, 'review')}</p>
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((r) => <li key={r._id}><Row item={r} onAct={(item, action) => setDialog({ item, action })} /></li>)}</ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ ...current, ...(n > 1 ? { page: String(n) } : {}) })} />}

      {spec && (
        <ReasonDialog
          title={spec.title} intro={spec.intro} confirmLabel={spec.confirm} danger={spec.danger}
          required={spec.required} minLength={spec.required ? 5 : 1} field="Reason" hint={spec.required ? 'The reviewer reads this.' : 'Kept in the record.'}
          submit={(reason) => adminReviewApi.setStatus(dialog.item._id, { status: spec.status, ...(reason ? { reason } : {}) })}
          onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }}
        />
      )}
    </div>
  );
}
