import { Link, useSearchParams } from 'react-router-dom';
import { Award, Clock, GraduationCap, ListChecks } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import CertificateDownload from '../../components/learning/CertificateDownload';
import { SkillChips, day } from '../../components/learning/OpportunityCard';
import { useFetch } from '../../hooks/useFetch';
import { applicationApi, experienceApi } from '../../services/learningApi';
import { APPLICATION_FILTERS, applicationLabel, applicationTone, formatHours } from '../../lib/learning';

function Tile({ icon, label, value }) {
  const Icon = icon;
  return (
    <GlassCard className="flex items-center gap-3 !p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-primary-tint"><Icon size={20} aria-hidden /></span>
      <div><p className="text-xl font-bold text-ink dark:text-white">{value}</p><p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{label}</p></div>
    </GlassCard>
  );
}

function Experience() {
  const { data, error, loading, reload } = useFetch((signal) => experienceApi.get(signal), []);
  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load your experience" />;
  if (loading && !data) return <div className="grid gap-3 sm:grid-cols-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full !rounded-3xl" />)}</div>;
  const { summary, items } = data;
  const certificates = items.filter((i) => i.certificate).length;
  return (
    <section aria-label="Your experience" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={ListChecks} label="Tasks completed" value={summary.completedCount} />
        <Tile icon={Clock} label="Supervised hours" value={formatHours(summary.totalHours)} />
        <Tile icon={Award} label="Certificates" value={certificates} />
      </div>
      {summary.skills?.length > 0 && (
        <GlassCard className="space-y-2 !p-4">
          <h2 className="text-sm font-semibold text-ink dark:text-white">Skills you have practised</h2>
          <SkillChips skills={summary.skills} max={30} />
        </GlassCard>
      )}
      {items.length > 0 && (
        <GlassCard className="space-y-3 !p-4" as="section" aria-label="Portfolio">
          <h2 className="text-lg font-bold text-ink dark:text-white">Your portfolio</h2>
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {items.map((i) => (
              <li key={i._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <Link to={`/dashboard/applications/${i._id}`} className="font-semibold text-ink hover:underline dark:text-white">{i.opportunity.title}</Link>
                  <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatHours(i.hours)} · supervised by {i.opportunity.supervisor?.name}</p>
                </div>
                {i.certificate ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone="green">Certificate {i.certificate}</Badge>
                    {i.certificateId && <CertificateDownload id={i.certificateId} certNo={i.certificate} />}
                  </span>
                ) : <Badge tone="neutral">Certificate pending approval</Badge>}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </section>
  );
}

function ApplicationCard({ application: a }) {
  const o = a.opportunity;
  return (
    <GlassCard as="article" className="flex flex-wrap items-center justify-between gap-3 !p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-ink dark:text-white"><Link to={`/dashboard/applications/${a._id}`} className="hover:underline">{o.title}</Link></h3>
          <Badge tone={applicationTone(a.status)}>{applicationLabel(a.status)}</Badge>
        </div>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{o.supervisor?.name} · {o.locationArea} · applied {day(a.createdAt)}{a.status === 'completed' ? ` · ${formatHours(a.hours)}` : ''}</p>
      </div>
      <Link to={`/dashboard/applications/${a._id}`} className="btn btn-glass !px-3 !py-1.5 text-sm">View</Link>
    </GlassCard>
  );
}

/** A student's learning home: experience summary, portfolio and every application with its status. */
export default function StudentLearning() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => applicationApi.list({ status, page, limit: 10 }, signal), [status, page]);
  const items = data?.items || [];
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">My learning</h1>
        <Link to="/opportunities" className="btn btn-primary">Find opportunities</Link>
      </div>

      <Experience />

      <section aria-label="My applications" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-bold text-ink dark:text-white">My applications</h2>
          <TextField as="select" label="Show" value={status} onChange={(e) => set({ status: e.target.value })} className="w-48">
            <option value="">All applications</option>
            {APPLICATION_FILTERS.map((s) => <option key={s} value={s}>{applicationLabel(s)}</option>)}
          </TextField>
        </div>
        {error ? (
          <ErrorState error={error} onRetry={reload} title="Could not load your applications" />
        ) : loading && !data ? (
          <div className="space-y-3" aria-busy>{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full !rounded-3xl" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={GraduationCap} art="learn" title={status ? 'No applications with this status' : 'You have not applied yet'} action={<Link to="/opportunities" className="btn btn-primary">Browse opportunities</Link>}>
            {status ? 'Choose another status to see the rest.' : 'Supervised tasks from verified technicians are open for applications.'}
          </EmptyState>
        ) : (
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((a) => <li key={a._id}><ApplicationCard application={a} /></li>)}</ul>
        )}
        {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ status, ...(n > 1 ? { page: String(n) } : {}) })} />}
      </section>
    </div>
  );
}
