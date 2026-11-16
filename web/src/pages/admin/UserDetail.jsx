import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import History from '../../components/admin/History';
import ReasonDialog from '../../components/admin/ReasonDialog';
import { useFetch } from '../../hooks/useFetch';
import { adminUserApi } from '../../services/adminApi';
import { ORG_TYPE, ROLE_LABEL, accountLabel, accountTone, verificationLabel, verificationTone } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

/** One account: what it is, what an administrator did to it, and the actions the server allows right now. */
export default function UserDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch((signal) => adminUserApi.get(id, signal), [id]);
  const [user, setUser] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (data) setUser(data); }, [data]);
  const u = user || data;

  return (
    <div className="space-y-4">
      <Link to="/dashboard/admin/users" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-secondary-strong underline dark:text-primary-tint"><ArrowLeft size={14} aria-hidden /> Back to users</Link>
      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load this account" />
      ) : loading && !u ? (
        <div className="space-y-3" aria-busy><Skeleton className="h-32 w-full !rounded-3xl" /><Skeleton className="h-40 w-full !rounded-3xl" /></div>
      ) : u && (
        <>
          <GlassCard className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink dark:text-white">{u.name}</h1>
              <Badge tone="neutral">{ROLE_LABEL[u.role] || u.role}</Badge>
              <Badge tone={accountTone(u.status)}>{accountLabel(u.status)}</Badge>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">Email</dt><dd className="font-medium text-ink dark:text-white">{u.email}{u.emailVerified ? '' : ' (not confirmed)'}</dd></div>
              <div><dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">Phone</dt><dd className="font-medium text-ink dark:text-white">{u.phone || 'Not given'}</dd></div>
              <div><dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">Joined</dt><dd className="font-medium text-ink dark:text-white">{formatDate(u.createdAt)}</dd></div>
              <div><dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">Last login</dt><dd className="font-medium text-ink dark:text-white">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</dd></div>
              {(u.city || u.state) && <div><dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">Location</dt><dd className="font-medium text-ink dark:text-white">{[u.city, u.state].filter(Boolean).join(', ')}</dd></div>}
            </dl>
            {u.suspension?.reason && (
              <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger dark:text-red-300">Suspended {formatDate(u.suspension.at)}: {u.suspension.reason}</p>
            )}
            {notice && <p role="status" className="text-sm font-semibold text-success">{notice}</p>}
            {u.actions?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {u.actions.includes('suspend') && <button type="button" className="btn bg-danger text-white hover:brightness-110" onClick={() => setDialog('suspend')}>Suspend account</button>}
                {u.actions.includes('reactivate') && <button type="button" className="btn btn-primary" onClick={() => setDialog('reactivate')}>Reactivate account</button>}
              </div>
            )}
          </GlassCard>

          {(u.verificationStatus || u.organisation) && (
            <GlassCard className="space-y-2">
              <h2 className="text-lg font-bold text-ink dark:text-white">Verification</h2>
              {u.verificationStatus && (
                <p className="flex flex-wrap items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]">
                  Provider documents: <Badge tone={verificationTone(u.verificationStatus)}>{verificationLabel(u.verificationStatus)}</Badge>
                  {u.verificationStatus !== 'not_submitted' && <Link to={`/dashboard/admin/verifications/${u._id}`} className="inline-flex min-h-[44px] items-center font-semibold text-secondary-strong underline dark:text-primary-tint">Open submission</Link>}
                </p>
              )}
              {u.organisation && (
                <p className="flex flex-wrap items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]">
                  Organisation {u.organisation.name}{u.organisation.type ? ` (${ORG_TYPE[u.organisation.type] || u.organisation.type})` : ''}: <Badge tone={verificationTone(u.organisation.recipientStatus)}>{verificationLabel(u.organisation.recipientStatus)}</Badge>
                  {u.organisation.recipientStatus !== 'not_submitted' && <Link to={`/dashboard/admin/verifications/${u._id}?type=recipient`} className="inline-flex min-h-[44px] items-center font-semibold text-secondary-strong underline dark:text-primary-tint">Open submission</Link>}
                </p>
              )}
            </GlassCard>
          )}

          <GlassCard className="space-y-3">
            <h2 className="text-lg font-bold text-ink dark:text-white">Administrator history</h2>
            <History items={u.history} />
          </GlassCard>

          {dialog === 'suspend' && (
            <ReasonDialog title={`Suspend ${u.name}?`} intro="They are signed out at once, cannot log in or take part in anything, and their listings and offers are hidden. They are shown the reason."
              confirmLabel="Suspend account" danger required minLength={5} field="Reason" hint="At least 5 characters. The person reads this."
              submit={(reason) => adminUserApi.setStatus(u._id, { status: 'suspended', reason })} onClose={() => setDialog(null)}
              onDone={(updated) => { setUser(updated); setDialog(null); setNotice('Account suspended.'); }} />
          )}
          {dialog === 'reactivate' && (
            <ReasonDialog title={`Reactivate ${u.name}?`} intro="They can log in again. A provider whose documents are not approved goes back to waiting for verification."
              confirmLabel="Reactivate account"
              submit={() => adminUserApi.setStatus(u._id, { status: 'active' })} onClose={() => setDialog(null)}
              onDone={(updated) => { setUser(updated); setDialog(null); setNotice('Account reactivated.'); }} />
          )}
        </>
      )}
    </div>
  );
}
