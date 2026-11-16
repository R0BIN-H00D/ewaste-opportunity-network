import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Boxes, Search } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import ReasonDialog from '../../components/admin/ReasonDialog';
import { useFetch } from '../../hooks/useFetch';
import { adminCategoryApi, adminListingApi } from '../../services/adminApi';
import { LISTING_STATUS, listingStatusLabel, listingStatusTone } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

const ACTION = {
  remove: { label: 'Remove listing', danger: true },
  restore: { label: 'Restore listing', danger: false },
};

function Row({ item, onAct }) {
  return (
    <GlassCard as="article" className="space-y-2 !p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-ink dark:text-white">{item.title}</h2>
        <Badge tone={listingStatusTone(item.status)}>{listingStatusLabel(item.status)}</Badge>
        {item.locked && <Badge tone="blue">Part of a service</Badge>}
        {item.reportCount > 0 && <Badge tone="amber">{plural(item.reportCount, 'report')}{item.openReports ? ` · ${item.openReports} waiting` : ''}</Badge>}
      </div>
      <p className="text-sm text-ink dark:text-[#E8F1EB]">
        {[[item.brand, item.model].filter(Boolean).join(' '), item.category?.name].filter(Boolean).join(' · ')}
      </p>
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
        Owner: {item.owner?.name || 'Removed account'}{item.area ? ` · ${item.area}` : ''} · listed {formatDate(item.createdAt)}
      </p>
      {item.removal?.reason && <p className="text-xs text-danger dark:text-red-300">Removed: {item.removal.reason}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link to={`/devices/${item._id}`} className="btn btn-glass !px-4 !py-2 text-sm" aria-label={`View ${item.title}`}>View listing</Link>
        {item.actions.filter((a) => ACTION[a]).map((a) => (
          <button key={a} type="button" className={`btn btn-glass !px-4 !py-2 text-sm ${ACTION[a].danger ? 'text-danger' : ''}`} onClick={() => onAct(item, a)} aria-label={`${ACTION[a].label}: ${item.title}`}>
            {ACTION[a].label}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

/** Every public listing, searchable and filterable, with remove and restore. Drafts stay private to their owners. */
export default function Listings() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const category = params.get('category') || '';
  const reported = params.get('reported') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const [text, setText] = useState(q);
  const [dialog, setDialog] = useState(null);
  const { data, error, loading, reload } = useFetch((signal) => adminListingApi.list({ q, status, category, reported, page, limit: 10 }, signal), [q, status, category, reported, page]);
  const cats = useFetch((signal) => adminCategoryApi.list(signal), []);
  const items = data?.items || [];
  const filtered = !!(q || status || category || reported);
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  const current = { q, status, category, reported };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Listings</h1>
      <form role="search" className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); set({ ...current, q: text.trim() }); }}>
        <TextField label="Search title, brand or model" type="search" value={text} onChange={(e) => setText(e.target.value)} className="w-64 max-w-full" />
        <button type="submit" className="btn btn-primary"><Search size={16} aria-hidden /> Search</button>
        <TextField as="select" label="Status" value={status} onChange={(e) => set({ ...current, status: e.target.value })} className="w-44">
          <option value="">All public</option>
          {Object.entries(LISTING_STATUS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField as="select" label="Category" value={category} onChange={(e) => set({ ...current, category: e.target.value })} className="w-52">
          <option value="">All categories</option>
          {(cats.data || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </TextField>
        <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium text-ink dark:text-white">
          <input type="checkbox" checked={reported === 'true'} onChange={(e) => set({ ...current, reported: e.target.checked ? 'true' : '' })} /> Reported only
        </label>
        {filtered && <button type="button" className="btn btn-glass" onClick={() => { setText(''); setParams({}); }}>Clear</button>}
      </form>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load listings" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Boxes} title={filtered ? 'No listing matches this search' : 'There are no listings yet'}>
          {filtered ? 'Check the spelling or clear the filters.' : 'Listings appear here as soon as people publish them.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" role="status">{plural(data.meta.total, 'listing')}</p>
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((l) => <li key={l._id}><Row item={l} onAct={(item, action) => setDialog({ item, action })} /></li>)}</ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ ...current, ...(n > 1 ? { page: String(n) } : {}) })} />}

      {dialog?.action === 'remove' && (
        <ReasonDialog
          title={`Remove “${dialog.item.title}”?`}
          intro="It disappears from the public pages straight away, and the owner is told why. You can restore it later."
          confirmLabel="Remove listing" danger required minLength={5} field="Reason" hint="The owner reads this."
          submit={(reason) => adminListingApi.moderate(dialog.item._id, { action: 'remove', reason })}
          onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }}
        />
      )}
      {dialog?.action === 'restore' && (
        <ReasonDialog
          title={`Restore “${dialog.item.title}”?`}
          intro="It goes back to the state it was in before it was removed, and the owner is told."
          confirmLabel="Restore listing" hint="Kept in the record."
          submit={(reason) => adminListingApi.moderate(dialog.item._id, { action: 'restore', ...(reason ? { reason } : {}) })}
          onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }}
        />
      )}
    </div>
  );
}
