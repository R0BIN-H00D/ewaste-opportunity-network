import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { adminVerificationApi } from '../../services/adminApi';
import { ORG_TYPE, PROVIDER_ROLES, ROLE_LABEL, verificationLabel, verificationTone } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

const TYPES = [['provider', 'Providers'], ['recipient', 'Recipient organisations']];
const STATUSES = [['pending', 'Waiting for review'], ['approved', 'Approved'], ['rejected', 'Not approved'], ['resubmission_required', 'Needs new documents'], ['all', 'Everything']];

function Row({ item }) {
  const org = item.organisation;
  return (
    <GlassCard as="article" className="flex flex-wrap items-center justify-between gap-3 !p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-ink dark:text-white">{item.name || 'Unknown person'}</h2>
          <Badge tone="neutral">{item.type === 'recipient' ? 'Recipient organisation' : ROLE_LABEL[item.role] || item.role}</Badge>
          <Badge tone={verificationTone(item.status)}>{verificationLabel(item.status)}</Badge>
        </div>
        <p className="truncate text-sm text-ink-muted dark:text-[#9FB2A7]">{item.email}</p>
        {org && <p className="text-sm text-ink dark:text-[#E8F1EB]">{org.name}{org.type ? ` · ${ORG_TYPE[org.type] || org.type}` : ''}{org.registrationNo ? ` · Reg. ${org.registrationNo}` : ''}</p>}
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
          {item.status === 'pending' ? 'Sent' : 'Decided'} {formatDate(item.status === 'pending' ? item.submittedAt : item.reviewedAt || item.submittedAt)}
          {item.type === 'provider' ? ` · ${item.documentCount} ${item.documentCount === 1 ? 'document' : 'documents'}` : ''}
        </p>
      </div>
      <Link to={`/dashboard/admin/verifications/${item.userId}?type=${item.type}`} className="btn btn-primary !px-4 !py-2 text-sm" aria-label={`Review ${item.name}`}>Review</Link>
    </GlassCard>
  );
}

/** The queue of accounts and organisations waiting for an administrator's decision (BR-01). */
export default function Verifications() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') === 'recipient' ? 'recipient' : 'provider';
  const status = params.get('status') || 'pending';
  const role = type === 'provider' ? params.get('role') || '' : '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => adminVerificationApi.list({ type, status, role, page, limit: 10 }, signal), [type, status, role, page]);
  const items = data?.items || [];
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'status' && v === 'pending') && !(k === 'type' && v === 'provider'))));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Verifications</h1>
      <p className="max-w-3xl text-sm text-ink-muted dark:text-[#9FB2A7]">Providers cannot offer services until you approve their documents, and organisations cannot receive donations until you approve them. Oldest requests are shown first.</p>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Kind of submission">
        {TYPES.map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={type === value} onClick={() => set({ type: value, status })}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${type === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted hover:text-ink dark:hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <TextField as="select" label="Show" value={status} onChange={(e) => set({ type, status: e.target.value, role })} className="w-56">
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        {type === 'provider' && (
          <TextField as="select" label="Role" value={role} onChange={(e) => set({ type, status, role: e.target.value })} className="w-56">
            <option value="">All providers</option>
            {PROVIDER_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </TextField>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load the queue" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={status === 'pending' ? 'Nothing is waiting for review' : 'Nothing matches these filters'}>
          {status === 'pending' ? 'New provider documents and organisation requests appear here as soon as they are sent.' : 'Try another status or role.'}
        </EmptyState>
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((i) => <li key={`${i.type}-${i.userId}`}><Row item={i} /></li>)}</ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ type, status, role, ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}
