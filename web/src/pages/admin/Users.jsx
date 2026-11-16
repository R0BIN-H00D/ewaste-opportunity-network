import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Users as UsersIcon } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { adminUserApi } from '../../services/adminApi';
import { ACCOUNT_STATUS, ROLES, ROLE_LABEL, accountLabel, accountTone, verificationLabel, verificationTone } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

function Row({ user }) {
  return (
    <GlassCard as="article" className="flex flex-wrap items-center justify-between gap-3 !p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-ink dark:text-white">{user.name}</h2>
          <Badge tone="neutral">{ROLE_LABEL[user.role] || user.role}</Badge>
          <Badge tone={accountTone(user.status)}>{accountLabel(user.status)}</Badge>
          {user.verificationStatus && user.verificationStatus !== 'approved' && <Badge tone={verificationTone(user.verificationStatus)}>{verificationLabel(user.verificationStatus)}</Badge>}
        </div>
        <p className="truncate text-sm text-ink-muted dark:text-[#9FB2A7]">{user.email}</p>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Joined {formatDate(user.createdAt)}{user.lastLoginAt ? ` · last login ${formatDate(user.lastLoginAt)}` : ' · has not logged in'}</p>
        {user.suspension?.reason && <p className="text-xs text-danger dark:text-red-300">Suspended: {user.suspension.reason}</p>}
      </div>
      <Link to={`/dashboard/admin/users/${user._id}`} className="btn btn-glass !px-4 !py-2 text-sm" aria-label={`Open ${user.name}`}>Open</Link>
    </GlassCard>
  );
}

/** Every account, searchable by name or email and filterable by role and status. */
export default function Users() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const role = params.get('role') || '';
  const status = params.get('status') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const [text, setText] = useState(q);
  const { data, error, loading, reload } = useFetch((signal) => adminUserApi.list({ q, role, status, page, limit: 10 }, signal), [q, role, status, page]);
  const items = data?.items || [];
  const filtered = !!(q || role || status);
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  const clear = () => { setText(''); setParams({}); };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Users</h1>
      <form role="search" className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim(), role, status }); }}>
        <TextField label="Search by name or email" type="search" value={text} onChange={(e) => setText(e.target.value)} className="w-64 max-w-full" />
        <button type="submit" className="btn btn-primary"><Search size={16} aria-hidden /> Search</button>
        <TextField as="select" label="Role" value={role} onChange={(e) => set({ q, role: e.target.value, status })} className="w-44">
          <option value="">All roles</option>
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField as="select" label="Status" value={status} onChange={(e) => set({ q, role, status: e.target.value })} className="w-52">
          <option value="">All except deleted</option>
          {Object.entries(ACCOUNT_STATUS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        {filtered && <button type="button" className="btn btn-glass" onClick={clear}>Clear</button>}
      </form>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load users" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={UsersIcon} title={filtered ? 'No one matches this search' : 'There are no accounts yet'}>
          {filtered ? 'Check the spelling or clear the filters.' : 'People appear here as soon as they register.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" role="status">{data.meta.total} {data.meta.total === 1 ? 'account' : 'accounts'}</p>
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((u) => <li key={u._id}><Row user={u} /></li>)}</ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ q, role, status, ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}
