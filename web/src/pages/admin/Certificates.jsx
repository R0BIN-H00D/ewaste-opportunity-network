import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Award } from 'lucide-react';
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
import { adminCertificateApi } from '../../services/adminApi';
import { formatDate } from '../../lib/requests';
import { friendlyMessage } from '../../utils/errors';

const STATES = ['waiting', 'issued', 'all'];
const hoursText = (h) => `${h} ${h === 1 ? 'hour' : 'hours'}`;

/** Students whose supervised task is finished. A certificate is issued here by hand, once per completed task. */
export default function Certificates() {
  const [params, setParams] = useSearchParams();
  const state = STATES.includes(params.get('state')) ? params.get('state') : 'waiting';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, error, loading, reload } = useFetch((signal) => adminCertificateApi.list({ state, page, limit: 10 }, signal), [state, page]);
  const [confirm, setConfirm] = useState(null); // an item
  const [notice, setNotice] = useState({ variant: 'error', text: '' });
  const save = useSave();
  const items = data?.items || [];
  const counts = data?.meta?.counts;
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));

  const issue = async () => {
    const item = confirm;
    setNotice({ variant: 'error', text: '' });
    const res = await save.run(() => adminCertificateApi.issue(item._id), 'Issued');
    setConfirm(null);
    if (res.ok) {
      setNotice({ variant: 'success', text: `Certificate ${res.result.certNo} issued to ${item.student.name}. They have been told.` });
    } else {
      setNotice({ variant: 'error', text: friendlyMessage(res.error) });
    }
    reload();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Certificates</h1>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Students earn a certificate when a supervised task is completed. Issue it here and the student is notified.</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TextField as="select" label="Show" value={state} onChange={(e) => set({ state: e.target.value === 'waiting' ? '' : e.target.value })} className="w-64">
          <option value="waiting">Waiting for a certificate</option>
          <option value="issued">Already issued</option>
          <option value="all">All</option>
        </TextField>
        {counts && <p className="text-sm text-ink dark:text-[#E8F1EB]">{`${counts.waiting} waiting · ${counts.issued} issued`}</p>}
      </div>
      <Alert variant={notice.variant}>{notice.text}</Alert>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load certificates" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Award} title={state === 'waiting' ? 'No certificates are waiting' : 'Nothing to show here'}>
          {state === 'waiting' ? 'When a student finishes a supervised task it appears here.' : 'Try another filter.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item._id}>
              <GlassCard as="article" className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-ink dark:text-white">{item.student.name}</h2>
                  <p className="text-sm text-ink dark:text-[#E8F1EB]">{item.task} · {hoursText(item.hours)}</p>
                  <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
                    {item.completedAt ? `Completed ${formatDate(item.completedAt)}` : 'Completed'}
                    {item.certificate ? ` · Issued ${formatDate(item.certificate.issuedAt)}` : ''}
                  </p>
                </div>
                {item.certificate ? (
                  <Badge tone="green">{item.certificate.certNo}</Badge>
                ) : (
                  <button
                    type="button" className="btn btn-primary" disabled={!item.canIssue} onClick={() => setConfirm(item)}
                    aria-label={`Issue certificate to ${item.student.name} for ${item.task}`}
                  >
                    <Award size={18} aria-hidden /> Issue certificate
                  </button>
                )}
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ state: state === 'waiting' ? '' : state, ...(n > 1 ? { page: String(n) } : {}) })} />}

      <ConfirmDialog
        open={Boolean(confirm)} title={`Issue a certificate to ${confirm?.student.name}?`} confirmLabel="Issue certificate" busy={save.saving}
        onCancel={() => setConfirm(null)} onConfirm={issue}
      >
        <p className="text-sm text-ink dark:text-[#E8F1EB]">{confirm ? `For “${confirm.task}”, ${hoursText(confirm.hours)}. The student is told, and it cannot be issued twice.` : ''}</p>
      </ConfirmDialog>
    </div>
  );
}
