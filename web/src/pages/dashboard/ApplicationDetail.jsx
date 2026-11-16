import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Award, Check } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ApplicationActions from '../../components/learning/ApplicationActions';
import { SkillChips, SupervisedTag, day } from '../../components/learning/OpportunityCard';
import { useFetch } from '../../hooks/useFetch';
import { applicationApi } from '../../services/learningApi';
import { applicationLabel, applicationSteps, applicationTone, difficultyLabel, difficultyTone, formatHours } from '../../lib/learning';
import { formatDate } from '../../lib/requests';

const DONE = { accept: 'The student has been accepted.', reject: 'The application was declined.', start: 'The task has started.', complete: 'The task is complete and the hours are recorded.', withdraw: 'Your application was withdrawn.' };

function Steps({ application }) {
  const steps = applicationSteps(application);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
      {steps.map((s) => (
        <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined} className="text-center">
          <span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${s.state === 'todo' ? 'bg-black/5 text-ink-muted dark:bg-white/10 dark:text-[#9FB2A7]' : 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark'}`}>
            {s.state === 'done' ? <Check size={16} aria-hidden /> : steps.indexOf(s) + 1}
          </span>
          <span className={`mt-1 block text-xs ${s.state === 'todo' ? 'text-ink-muted dark:text-[#9FB2A7]' : 'font-semibold text-ink dark:text-white'}`}>{s.label}<span className="sr-only"> ({s.state === 'done' ? 'done' : s.state === 'current' ? 'current' : 'not yet'})</span></span>
        </li>
      ))}
    </ol>
  );
}

/** One application. The student sees their own; the supervising technician sees the student's college, course and hours (never contact details). */
export default function ApplicationDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data, error, loading, reload } = useFetch((signal) => applicationApi.get(id, signal), [id]);
  const [flash, setFlash] = useState(location.state?.flash || '');
  const a = data;

  if (loading && !a) return <div className="space-y-4" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  if (error && !a) {
    const missing = error.status === 404 || error.status === 422;
    return <ErrorState error={missing ? { message: 'This application does not exist or is not yours.' } : error} title={missing ? 'Application not found' : 'Could not load this application'} onRetry={missing ? undefined : reload} />;
  }

  const o = a.opportunity;
  const supervisor = a.viewerRole !== 'student';
  const back = supervisor ? `/dashboard/learning-tasks/${o._id}` : '/dashboard/learning';
  const stopped = a.status === 'rejected' || a.status === 'withdrawn';

  return (
    <div className="space-y-5">
      <Link to={back} className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> {supervisor ? 'Back to the task' : 'My learning'}</Link>
      <Alert variant="success">{flash}</Alert>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-ink dark:text-white">{supervisor ? `${a.student?.name}’s application` : o.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={applicationTone(a.status)}>{applicationLabel(a.status)}</Badge>
          <Badge tone={difficultyTone(o.difficulty)}>{difficultyLabel(o.difficulty)}</Badge>
          <SupervisedTag />
        </div>
      </header>

      <GlassCard className="space-y-4" as="section" aria-label="Progress">
        <Steps application={a} />
        {stopped && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{a.status === 'rejected' ? 'This application was not accepted.' : 'This application was withdrawn.'}</p>}
        <ApplicationActions application={a} onDone={(updated, action) => { setFlash(DONE[action]); reload(); }} />
      </GlassCard>

      {a.status === 'completed' && (
        <GlassCard className="space-y-2" as="section" aria-label="Result">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink dark:text-white"><Award size={18} aria-hidden /> Completed</h2>
          <p className="text-sm text-ink dark:text-[#E8F1EB]">{formatHours(a.hours)} recorded{a.completedAt ? ` on ${formatDate(a.completedAt)}` : ''}.</p>
          {a.certificate
            ? <p className="text-sm text-ink dark:text-[#E8F1EB]">Certificate <strong>{a.certificate}</strong> has been issued.</p>
            : <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">The certificate is issued after an administrator approves it.</p>}
        </GlassCard>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <GlassCard className="space-y-3" as="section" aria-label="The task">
          <h2 className="text-lg font-bold text-ink dark:text-white">The task</h2>
          <p className="text-sm font-semibold text-ink dark:text-white">{supervisor ? o.title : <Link to={`/opportunities/${o._id}`} className="hover:underline">{o.title}</Link>}</p>
          <dl className="space-y-1 text-sm text-ink dark:text-[#E8F1EB]">
            <div><dt className="inline font-semibold">Where: </dt><dd className="inline">{o.locationArea}</dd></div>
            <div><dt className="inline font-semibold">Apply by: </dt><dd className="inline">{day(o.deadline)}</dd></div>
            {!supervisor && o.supervisor && <div><dt className="inline font-semibold">Supervisor: </dt><dd className="inline">{o.supervisor.name}</dd></div>}
          </dl>
          <SkillChips skills={o.requiredSkills} max={20} />
        </GlassCard>

        <GlassCard className="space-y-3" as="section" aria-label="The student">
          <h2 className="text-lg font-bold text-ink dark:text-white">{supervisor ? 'The student' : 'Your application'}</h2>
          {supervisor && (
            <dl className="space-y-1 text-sm text-ink dark:text-[#E8F1EB]">
              <div><dt className="inline font-semibold">Name: </dt><dd className="inline">{a.student?.name}</dd></div>
              {a.student?.college && <div><dt className="inline font-semibold">College: </dt><dd className="inline">{a.student.college}</dd></div>}
              {a.student?.course && <div><dt className="inline font-semibold">Course: </dt><dd className="inline">{a.student.course}{a.student.yearOfStudy ? `, year ${a.student.yearOfStudy}` : ''}</dd></div>}
              <div><dt className="inline font-semibold">Hours completed so far: </dt><dd className="inline">{formatHours(a.student?.hoursCompleted)}</dd></div>
            </dl>
          )}
          {supervisor && <SkillChips skills={a.student?.skills} max={20} />}
          <div>
            <h3 className="text-sm font-semibold text-ink dark:text-white">{supervisor ? 'Their message' : 'Your message'}</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-ink dark:text-[#E8F1EB]">{a.message || <span className="text-ink-muted dark:text-[#9FB2A7]">No message.</span>}</p>
          </div>
          {a.supervisorFeedback && (
            <div>
              <h3 className="text-sm font-semibold text-ink dark:text-white">{supervisor ? 'Your feedback' : 'Feedback from your supervisor'}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-ink dark:text-[#E8F1EB]">{a.supervisorFeedback}</p>
            </div>
          )}
        </GlassCard>
      </div>

      {a.history?.length > 0 && (
        <GlassCard className="space-y-2" as="section" aria-label="History">
          <h2 className="text-lg font-bold text-ink dark:text-white">History</h2>
          <ol className="space-y-1.5 text-sm">
            {a.history.map((h, i) => (
              <li key={`${h.status}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-ink dark:text-[#E8F1EB]">
                <span className="font-semibold">{applicationLabel(h.status)}</span>
                <span className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(h.at)}</span>
                {h.note && <span className="text-ink-muted dark:text-[#9FB2A7]">· {h.note}</span>}
              </li>
            ))}
          </ol>
        </GlassCard>
      )}
    </div>
  );
}
