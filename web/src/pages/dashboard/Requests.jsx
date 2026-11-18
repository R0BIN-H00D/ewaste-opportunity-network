import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { Thumb } from '../../components/devices/DeviceCard';
import { useAuth } from '../../hooks/useAuth';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { requestApi, technicianApi } from '../../services/repairApi';
import { AVAILABILITY, formatDate, statusLabel, statusTone } from '../../lib/requests';

const CUSTOMER_TABS = [['active', 'Active'], ['all', 'All']];
const TECH_TABS = [['board', 'Open requests'], ['jobs', 'My jobs'], ['all', 'All my jobs'], ['mine', 'My own requests']];

function RequestRow({ request: r, technicianView }) {
  const other = technicianView ? r.customer : r.technician;
  return (
    <GlassCard as="article" className="flex flex-col gap-4 !p-4 sm:flex-row sm:items-center">
      <Thumb listing={r.listing} className="h-20 w-full shrink-0 rounded-2xl sm:w-28" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-bold text-ink dark:text-white">{r.listing?.title}</h2>
          <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
        </div>
        <p className="mt-1 line-clamp-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{r.issueDescription}</p>
        <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">
          {other?.name ? `${technicianView ? 'Customer' : 'Technician'}: ${other.name} · ` : !technicianView && r.mode === 'open' && !r.technician ? 'Open to any suitable technician · ' : ''}
          Updated {formatDate(r.updatedAt)}
        </p>
      </div>
      <Link to={`/dashboard/requests/${r._id}`} className="btn btn-glass whitespace-nowrap" aria-label={`Open request for ${r.listing?.title}`}>
        {r.actions?.length ? 'Action needed' : 'View'}
      </Link>
    </GlassCard>
  );
}

function AvailabilityControl({ initial = '' }) {
  const [value, setValue] = useState(initial);
  const save = useSave();
  const change = async (e) => {
    const status = e.target.value;
    setValue(status);
    await save.run(() => technicianApi.setAvailability(status), 'Availability updated');
  };
  return (
    <div className="max-w-xs">
      <TextField as="select" label="Your availability" value={value} onChange={change} hint="Technicians who are not taking jobs are not suggested to customers.">
        <option value="" disabled>Choose…</option>
        {AVAILABILITY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </TextField>
      <Alert variant={save.status === 'error' ? 'error' : 'success'}>{save.status === 'saved' || save.status === 'error' ? save.message : ''}</Alert>
    </div>
  );
}

export default function Requests() {
  const { user, roleProfile } = useAuth();
  const technician = user?.role === 'technician';
  const tabs = technician ? TECH_TABS : CUSTOMER_TABS;
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || tabs[0][0];
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);

  const query = technician
    ? tab === 'board' ? { as: 'board' } : tab === 'jobs' ? { as: 'technician', active: 'true' } : tab === 'mine' ? { as: 'customer' } : { as: 'technician' }
    : { as: 'customer', ...(tab === 'active' ? { active: 'true' } : {}) };
  const { data, error, loading, reload } = useFetch((signal) => requestApi.list({ ...query, page, limit: 8 }, signal), [tab, page, user?.role]);
  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">{technician ? 'Repair requests and jobs' : 'My repairs'}</h1>
      </div>

      {technician && <AvailabilityControl initial={roleProfile?.availability?.status || ''} />}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter requests">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setParams(value === tabs[0][0] ? {} : { tab: value })}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted hover:text-ink dark:hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        error.code === 'NOT_VERIFIED' ? (
          <EmptyState icon={ClipboardList} title="Your account is waiting for verification" action={<Link to="/dashboard/settings" className="btn btn-glass">Check verification</Link>}>
            You can take repair jobs once an administrator has approved your documents.
          </EmptyState>
        ) : (
          <ErrorState error={error} onRetry={reload} title="Could not load requests" />
        )
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title={tab === 'board' ? 'No open requests near you' : 'Nothing here yet'}>
          {technician ? (tab === 'board' ? 'New requests that match your device types and service area will appear here.' : 'Jobs you accept will appear here.') : 'List a device for repair, then ask a technician to look at it.'}
        </EmptyState>
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {items.map((r) => <li key={r._id}><RequestRow request={r} technicianView={technician && tab !== 'mine'} /></li>)}
        </ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...(tab !== tabs[0][0] ? { tab } : {}), ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}
