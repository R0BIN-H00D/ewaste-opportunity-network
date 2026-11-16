import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, GraduationCap, Search, X } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import OpportunityCard, { SkillChips, SupervisedTag, day } from '../../components/learning/OpportunityCard';
import { Rating } from '../../components/requests/TechnicianCard';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { useAuth } from '../../hooks/useAuth';
import { useCategories } from '../../hooks/useCategories';
import { applicationApi, opportunityApi } from '../../services/learningApi';
import { APPLY_BLOCK, DIFFICULTIES, applicationLabel, applicationTone, difficultyLabel, difficultyTone, formatHours, opportunityLabel, opportunityTone } from '../../lib/learning';
import { friendlyMessage } from '../../utils/errors';

const KEYS = ['q', 'difficulty', 'category', 'skill'];
const PAGE_SIZE = 12;

/** Public feed of supervised practical tasks that are open for applications (FR-STU-002). */
export function OpportunityDirectory() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const [draft, setDraft] = useState(filters);
  const key = JSON.stringify(filters);
  useEffect(() => setDraft(filters), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, loading, reload } = useFetch((signal) => opportunityApi.list({ ...filters, page, limit: PAGE_SIZE }, signal), [key, page]);
  const items = data?.items || [];
  const active = KEYS.some((k) => filters[k]);
  const apply = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6 space-y-2">
        <h1 className="text-3xl font-extrabold text-ink dark:text-white sm:text-4xl">Student opportunities</h1>
        <p className="max-w-3xl text-ink-muted dark:text-[#9FB2A7]">Hands-on tasks for electronics and computer students, posted by verified technicians who supervise every step. Hazardous e-waste handling is never part of a student task.</p>
      </header>

      <form role="search" aria-label="Search opportunities" noValidate onSubmit={(e) => { e.preventDefault(); apply(draft); }} className="glass mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <TextField label="Search" type="search" value={draft.q} onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))} placeholder="Task or topic" maxLength={100} />
        <TextField as="select" label="Difficulty" value={draft.difficulty} onChange={(e) => { const next = { ...draft, difficulty: e.target.value }; setDraft(next); apply(next); }}>
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField as="select" label="Device type" value={draft.category} onChange={(e) => { const next = { ...draft, category: e.target.value }; setDraft(next); apply(next); }}>
          <option value="">Any device</option>
          {categories.filter((c) => !c.hazardous).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </TextField>
        <TextField label="Skill" value={draft.skill} onChange={(e) => setDraft((d) => ({ ...d, skill: e.target.value }))} placeholder="multimeter" maxLength={40} />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary"><Search size={16} aria-hidden /> Search</button>
          {active && <button type="button" className="btn btn-glass" aria-label="Clear all filters" onClick={() => setParams({})}><X size={16} aria-hidden /> Clear</button>}
        </div>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load the opportunities" />
      ) : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={GraduationCap} title={active ? 'No opportunities match your search' : 'No open opportunities right now'} action={active ? <button type="button" className="btn btn-primary" onClick={() => setParams({})}>Clear filters</button> : <Link to="/register" className="btn btn-primary">Join as a student</Link>}>
          {active ? 'Try fewer filters or another skill.' : 'Verified technicians post tasks here. Check back soon, or join so you are ready to apply.'}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted dark:text-[#9FB2A7]" aria-live="polite">{data.meta.total} {data.meta.total === 1 ? 'opportunity' : 'opportunities'} found</p>
          <ul className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>{items.map((o) => <li key={o._id}><OpportunityCard opportunity={o} to={`/opportunities/${o._id}`} /></li>)}</ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

function Fact({ label, children }) {
  if (children === undefined || children === null || children === '') return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink dark:text-[#E8F1EB]">{children}</dd>
    </div>
  );
}

/** The apply box: what a student, a visitor, the supervisor and everyone else sees. The server decides whether applying is possible. */
function ApplyPanel({ opportunity: o }) {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const save = useSave();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!isAuthenticated) {
    return (
      <GlassCard className="space-y-3" as="section" aria-label="Apply">
        <h2 className="text-lg font-bold text-ink dark:text-white">Apply for this task</h2>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">Verified students can apply. Log in to your student account, or join if you are new.</p>
        <div className="flex flex-wrap gap-2"><Link to="/login" className="btn btn-primary">Log in to apply</Link><Link to="/register" className="btn btn-glass">Join as a student</Link></div>
      </GlassCard>
    );
  }
  if (o.viewerRole === 'supervisor') {
    return (
      <GlassCard className="space-y-3" as="section" aria-label="Apply">
        <h2 className="text-lg font-bold text-ink dark:text-white">This is your task</h2>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">Review applicants, accept students and record completed hours from your task page.</p>
        <Link to={`/dashboard/learning-tasks/${o._id}`} className="btn btn-primary">Manage this task</Link>
      </GlassCard>
    );
  }
  if (user?.role !== 'student') {
    return (
      <GlassCard className="space-y-2" as="section" aria-label="Apply">
        <h2 className="text-lg font-bold text-ink dark:text-white">For verified students</h2>
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Only students with an approved account can apply to supervised tasks.</p>
      </GlassCard>
    );
  }

  const mine = o.myApplication;
  const withdrawn = mine?.status === 'withdrawn';
  if (mine && !withdrawn) {
    return (
      <GlassCard className="space-y-3" as="section" aria-label="Apply">
        <h2 className="text-lg font-bold text-ink dark:text-white">Your application</h2>
        <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]">Status: <Badge tone={applicationTone(mine.status)}>{applicationLabel(mine.status)}</Badge></p>
        <Link to={`/dashboard/applications/${mine._id}`} className="btn btn-primary">View your application</Link>
      </GlassCard>
    );
  }
  if (o.applyBlock) {
    return (
      <GlassCard className="space-y-3" as="section" aria-label="Apply">
        <h2 className="text-lg font-bold text-ink dark:text-white">Apply for this task</h2>
        <Alert variant="info">{APPLY_BLOCK[o.applyBlock] || 'You cannot apply right now.'}</Alert>
      </GlassCard>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (message.length > 500) return setError('Keep your message to 500 characters or fewer.');
    setError('');
    const res = await save.run(() => applicationApi.apply(o._id, message.trim()), 'Application sent');
    if (res.ok) navigate(`/dashboard/applications/${res.result._id}`, { state: { flash: 'Your application was sent. The supervising technician will respond.' } });
    return res;
  };
  return (
    <GlassCard className="space-y-3" as="section" aria-label="Apply">
      <h2 className="text-lg font-bold text-ink dark:text-white">Apply for this task</h2>
      {withdrawn && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">You withdrew earlier. You can apply again.</p>}
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Apply for this task">
        <TextField as="textarea" rows={4} label="Message to the supervisor (optional)" value={message} onChange={(e) => { setMessage(e.target.value); setError(''); }} error={error} maxLength={500} hint="What you have tried before and why this task interests you." />
        <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
        <button type="submit" className="btn btn-primary" disabled={save.saving}>{save.saving ? 'Sending…' : 'Apply'}</button>
      </form>
    </GlassCard>
  );
}

/** One opportunity: the task, what it needs, who supervises it, and the apply box. */
export function OpportunityDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: o, error, loading, reload } = useFetch((signal) => opportunityApi.get(id, signal), [id, user?._id]);

  if (loading && !o) return <div className="mx-auto max-w-4xl space-y-5 px-4 py-10" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  if (error && !o) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-10">
        <ErrorState error={missing ? { message: 'This opportunity does not exist.' } : error} title={missing ? 'Opportunity not found' : 'Could not load this opportunity'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to="/opportunities" className="font-semibold text-primary underline dark:text-primary-tint">Back to the opportunities</Link></p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-10">
      <Link to="/opportunities" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Student opportunities</Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold text-ink dark:text-white">{o.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={difficultyTone(o.difficulty)}>{difficultyLabel(o.difficulty)}</Badge>
          <Badge tone={opportunityTone(o.status)}>{opportunityLabel(o.status)}</Badge>
          <SupervisedTag />
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          {o.description && (
            <GlassCard as="section" aria-label="About the task" className="space-y-2">
              <h2 className="text-lg font-bold text-ink dark:text-white">About the task</h2>
              <p className="whitespace-pre-line text-sm text-ink dark:text-[#E8F1EB]">{o.description}</p>
            </GlassCard>
          )}
          <GlassCard as="section" aria-label="Task details" className="space-y-3">
            <h2 className="text-lg font-bold text-ink dark:text-white">Details</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="Device type">{o.deviceType?.name}</Fact>
              <Fact label="Where">{o.locationArea}</Fact>
              <Fact label="Apply by">{day(o.deadline)}</Fact>
              <Fact label="Places">{`${o.seatsLeft} of ${o.seats} left`}</Fact>
              <Fact label="Expected time">{o.expectedHours ? formatHours(o.expectedHours) : null}</Fact>
            </dl>
            {o.requiredSkills?.length > 0 && <div className="space-y-1"><h3 className="text-sm font-semibold text-ink dark:text-white">Useful skills</h3><SkillChips skills={o.requiredSkills} max={20} /></div>}
          </GlassCard>
          <GlassCard as="section" aria-label="Supervision" className="space-y-2">
            <h2 className="text-lg font-bold text-ink dark:text-white">Supervision and safety</h2>
            <p className="text-sm text-ink dark:text-[#E8F1EB]">{o.supervisor?.name} supervises this task from start to finish. Students never handle hazardous e-waste on their own, so tasks like monitors, televisions, batteries and circuit boards are not offered.</p>
            <p className="flex items-center gap-2 text-sm text-ink-muted dark:text-[#9FB2A7]">Supervisor: <strong className="text-ink dark:text-white">{o.supervisor?.name}</strong>{o.supervisor?.city ? ` · ${o.supervisor.city}` : ''}<Rating avg={o.supervisor?.ratingAvg} count={o.supervisor?.ratingCount} /></p>
          </GlassCard>
        </div>
        <ApplyPanel opportunity={o} />
      </div>
    </div>
  );
}
