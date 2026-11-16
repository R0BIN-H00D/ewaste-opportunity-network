import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ReasonDialog from '../../components/admin/ReasonDialog';
import { useFetch } from '../../hooks/useFetch';
import { adminComplaintApi } from '../../services/adminApi';
import { COMPLAINT_ABOUT, complaintLabel, complaintTone } from '../../lib/complaints';
import { ROLE_LABEL } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

const DIALOG = {
  assign: { button: 'Assign to me', title: 'Take this complaint?', intro: 'It is assigned to you, and the person who filed it is told that an administrator has picked it up.', confirm: 'Assign to me', hint: 'Only administrators see this.' },
  start_review: { button: 'Start review', title: 'Start reviewing this complaint?', intro: 'It moves to “Being reviewed”. The person who filed it, and the person it is about, are told. The second person is not shown what was written.', confirm: 'Start review', hint: 'Only administrators see this.' },
  resolve: { button: 'Resolve', title: 'Resolve this complaint?', intro: 'Write the outcome. The person who filed it reads it, so say what was done.', confirm: 'Resolve complaint', required: true, field: 'Outcome', hint: 'At least 5 characters. The person reads this.' },
  reject: { button: 'Reject', title: 'Reject this complaint?', intro: 'Use this when the complaint cannot be acted on. Say why; the person who filed it reads it.', confirm: 'Reject complaint', required: true, danger: true, field: 'Reason', hint: 'At least 5 characters. The person reads this.' },
};

function Person({ label, person }) {
  if (!person) return null;
  return (
    <div>
      <dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">{label}</dt>
      <dd className="font-medium text-ink dark:text-white">
        <Link to={`/dashboard/admin/users/${person._id}`} className="underline">{person.name}</Link> <span className="text-xs text-ink-muted dark:text-[#9FB2A7]">({ROLE_LABEL[person.role] || person.role})</span>
      </dd>
    </div>
  );
}

/** One complaint: both people, what was written, who is handling it, the history, and the moves the server allows right now. */
export default function ComplaintDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch((signal) => adminComplaintApi.get(id, signal), [id]);
  const [complaint, setComplaint] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (data) setComplaint(data); }, [data]);
  const c = complaint || data;
  const spec = dialog ? DIALOG[dialog] : null;

  return (
    <div className="space-y-4">
      <Link to="/dashboard/admin/complaints" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-secondary-strong underline dark:text-primary-tint"><ArrowLeft size={14} aria-hidden /> Back to complaints</Link>
      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load this complaint" />
      ) : loading && !c ? (
        <div className="space-y-3" aria-busy><Skeleton className="h-40 w-full !rounded-3xl" /><Skeleton className="h-40 w-full !rounded-3xl" /></div>
      ) : c && (
        <>
          <GlassCard className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink dark:text-white">{c.subject}</h1>
              <Badge tone={complaintTone(c.status)}>{complaintLabel(c.status)}</Badge>
              <Badge tone="neutral">{COMPLAINT_ABOUT[c.refType] || c.refType}</Badge>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Person label="Filed by" person={c.filedBy} />
              <Person label="About" person={c.against} />
              <div><dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">Filed</dt><dd className="font-medium text-ink dark:text-white">{formatDate(c.createdAt)}</dd></div>
              <div><dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">Handled by</dt><dd className="font-medium text-ink dark:text-white">{c.assignedTo ? c.assignedTo.name : 'Nobody yet'}</dd></div>
            </dl>
            <p className="whitespace-pre-line rounded-xl border border-white/30 bg-white/30 px-3 py-2 text-sm text-ink dark:bg-white/5 dark:text-[#E8F1EB]">{c.description}</p>
            {c.resolution && <p className="text-sm text-ink dark:text-[#E8F1EB]"><span className="font-semibold">Outcome:</span> {c.resolution}</p>}
            {notice && <p role="status" className="text-sm font-semibold text-success">{notice}</p>}
            {c.actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {c.actions.map((a) => (
                  <button key={a} type="button" className={a === 'reject' ? 'btn btn-glass text-danger' : a === 'resolve' ? 'btn btn-primary' : 'btn btn-glass'} onClick={() => setDialog(a)}>{DIALOG[a].button}</button>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard className="space-y-3">
            <h2 className="text-lg font-bold text-ink dark:text-white">History</h2>
            <ol className="space-y-2">
              {[...c.history].reverse().map((h, i) => (
                <li key={`${h.status}-${h.at}-${i}`} className="rounded-xl border border-white/30 bg-white/30 px-3 py-2 text-sm dark:bg-white/5">
                  <p className="font-semibold text-ink dark:text-white">{h.status === 'open' && h.note === 'Filed' ? 'Filed' : complaintLabel(h.status)}</p>
                  <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(h.at)}{h.by?.name ? ` · ${h.by.name}` : ''}</p>
                  {h.note && h.note !== 'Filed' && <p className="mt-1 text-ink dark:text-[#E8F1EB]">{h.note}</p>}
                </li>
              ))}
            </ol>
          </GlassCard>

          {spec && (
            <ReasonDialog
              title={spec.title} intro={spec.intro} confirmLabel={spec.confirm} danger={spec.danger} required={spec.required} minLength={spec.required ? 5 : 1}
              field={spec.field || 'Note'} hint={spec.hint}
              submit={(text) => adminComplaintApi.act(c._id, { action: dialog, ...(text ? { note: text } : {}) })}
              onClose={() => setDialog(null)}
              onDone={(updated) => { setComplaint(updated); setDialog(null); setNotice('Saved.'); }}
            />
          )}
        </>
      )}
    </div>
  );
}
