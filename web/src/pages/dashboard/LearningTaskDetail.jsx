import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import ApplicationActions from '../../components/learning/ApplicationActions';
import { SkillChips, SupervisedTag, day } from '../../components/learning/OpportunityCard';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { opportunityApi } from '../../services/learningApi';
import { APPLICATION_FILTERS, applicationLabel, applicationTone, difficultyLabel, difficultyTone, formatHours, opportunityLabel, opportunityTone } from '../../lib/learning';
import { friendlyMessage } from '../../utils/errors';

function Applicant({ application: a, onChanged }) {
  const s = a.student || {};
  return (
    <GlassCard as="article" className="space-y-2 !p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-ink dark:text-white"><Link to={`/dashboard/applications/${a._id}`} className="hover:underline">{s.name}</Link></h3>
            <Badge tone={applicationTone(a.status)}>{applicationLabel(a.status)}</Badge>
          </div>
          <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{[s.college, s.course, s.yearOfStudy ? `year ${s.yearOfStudy}` : null].filter(Boolean).join(' · ') || 'No college details'} · {formatHours(s.hoursCompleted)} completed so far</p>
        </div>
        <Link to={`/dashboard/applications/${a._id}`} className="text-sm font-semibold text-primary underline dark:text-primary-tint">Details</Link>
      </div>
      {a.message && <p className="whitespace-pre-line text-sm text-ink dark:text-[#E8F1EB]">{a.message}</p>}
      <SkillChips skills={s.skills} />
      {a.status === 'completed' && <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatHours(a.hours)} recorded</p>}
      <ApplicationActions application={a} size="sm" onDone={onChanged} />
    </GlassCard>
  );
}

function Applicants({ taskId, counts, refreshKey, onChanged }) {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => opportunityApi.applicants(taskId, { status, page, limit: 10 }, signal), [taskId, status, page, refreshKey]);
  const items = data?.items || [];
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));

  return (
    <section aria-label="Applicants" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold text-ink dark:text-white">Applicants</h2>
        <TextField as="select" label="Show" value={status} onChange={(e) => set({ status: e.target.value })} className="w-52">
          <option value="">All applicants</option>
          {APPLICATION_FILTERS.map((s) => <option key={s} value={s}>{applicationLabel(s)}{counts?.[s] ? ` (${counts[s]})` : ''}</option>)}
        </TextField>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load the applicants" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Users} title={status ? 'No applicants with this status' : 'No applications yet'}>
          {status ? 'Choose another status to see the rest.' : 'Students who apply will appear here. You decide who takes part.'}
        </EmptyState>
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((a) => <li key={a._id}><Applicant application={a} onChanged={onChanged} /></li>)}</ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ status, ...(n > 1 ? { page: String(n) } : {}) })} />}
    </section>
  );
}

/** A technician's view of one student task: details, open/close, and every applicant with the actions the server allows. */
export default function LearningTaskDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data: o, error, loading, reload } = useFetch((signal) => opportunityApi.get(id, signal), [id]);
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const save = useSave();

  if (loading && !o) return <div className="space-y-4" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  if (error && !o) {
    const missing = error.status === 404 || error.status === 422;
    return <ErrorState error={missing ? { message: 'This task does not exist or is not yours.' } : error} title={missing ? 'Task not found' : 'Could not load this task'} onRetry={missing ? undefined : reload} />;
  }
  if (o.viewerRole !== 'supervisor' && o.viewerRole !== 'admin') {
    return <ErrorState error={{ message: 'Only the technician who posted this task can manage it.' }} title="Task not found" />;
  }

  const mine = o.viewerRole === 'supervisor';
  const closed = o.status === 'closed';
  const changed = (_, action) => {
    setFlash({ accept: 'The student has been accepted.', reject: 'The application was declined.', start: 'The task has started.', complete: 'The task is complete and the hours are recorded.' }[action] || '');
    setRefreshKey((k) => k + 1);
    reload();
  };
  const toggle = async () => {
    const res = await save.run(() => opportunityApi.setStatus(o._id, closed ? 'open' : 'closed'), closed ? 'Reopened' : 'Closed');
    setConfirmClose(false);
    if (res.ok) {
      setFlash(closed ? 'The task is open for applications again.' : 'The task is closed. Pending applications were declined.');
      setRefreshKey((k) => k + 1);
      reload();
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/dashboard/learning-tasks" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Student tasks</Link>
      <Alert variant="success">{flash}</Alert>
      <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-ink dark:text-white">{o.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={opportunityTone(o.status)}>{opportunityLabel(o.status)}</Badge>
          <Badge tone={difficultyTone(o.difficulty)}>{difficultyLabel(o.difficulty)}</Badge>
          <SupervisedTag />
        </div>
      </header>

      <GlassCard className="space-y-3" as="section" aria-label="Task details">
        {o.description && <p className="whitespace-pre-line text-sm text-ink dark:text-[#E8F1EB]">{o.description}</p>}
        <dl className="grid gap-2 text-sm text-ink dark:text-[#E8F1EB] sm:grid-cols-2">
          <div><dt className="inline font-semibold">Device type: </dt><dd className="inline">{o.deviceType?.name}</dd></div>
          <div><dt className="inline font-semibold">Area: </dt><dd className="inline">{o.locationArea}</dd></div>
          <div><dt className="inline font-semibold">Apply by: </dt><dd className="inline">{day(o.deadline)}</dd></div>
          <div><dt className="inline font-semibold">Places: </dt><dd className="inline">{o.seatsTaken} of {o.seats} taken</dd></div>
          {o.expectedHours ? <div><dt className="inline font-semibold">Expected time: </dt><dd className="inline">{formatHours(o.expectedHours)}</dd></div> : null}
        </dl>
        <SkillChips skills={o.requiredSkills} max={20} />
        {mine && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Link to={`/dashboard/learning-tasks/${o._id}/edit`} className="btn btn-glass">Edit task</Link>
            {closed ? <button type="button" className="btn btn-primary" onClick={toggle} disabled={save.saving}>{save.saving ? 'Working…' : 'Reopen task'}</button> : <button type="button" className="btn btn-glass" onClick={() => setConfirmClose(true)}>Close task</button>}
            <Link to={`/opportunities/${o._id}`} className="btn btn-glass">View public page</Link>
          </div>
        )}
      </GlassCard>

      <Applicants taskId={o._id} counts={o.counts} refreshKey={refreshKey} onChanged={changed} />

      <ConfirmDialog open={confirmClose} title="Close this task?" confirmLabel="Close task" danger busy={save.saving} onConfirm={toggle} onCancel={() => setConfirmClose(false)}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">Students can no longer apply. Applications still waiting for your answer are declined and the students are told. Students already accepted keep their place.</p>
      </ConfirmDialog>
    </div>
  );
}
