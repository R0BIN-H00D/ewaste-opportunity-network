import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import { useFetch } from '../../hooks/useFetch';
import { complaintApi } from '../../services/complaintApi';
import { COMPLAINT_ABOUT, complaintLabel, complaintTone, isClosed } from '../../lib/complaints';
import { formatDate } from '../../lib/requests';

/** One of the person's complaints: what they wrote, where it stands, and the outcome once it is closed. */
export default function ComplaintDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data: c, error, loading, reload } = useFetch((signal) => complaintApi.get(id, signal), [id]);

  return (
    <div className="space-y-4">
      <Link to="/dashboard/complaints" className="inline-flex items-center gap-1 text-sm font-semibold text-secondary-strong underline dark:text-primary-tint"><ArrowLeft size={14} aria-hidden /> Back to complaints</Link>
      {location.state?.flash && <Alert variant="success">{location.state.flash}</Alert>}
      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load this complaint" />
      ) : loading && !c ? (
        <div className="space-y-3" aria-busy><Skeleton className="h-32 w-full !rounded-3xl" /><Skeleton className="h-32 w-full !rounded-3xl" /></div>
      ) : c && (
        <>
          <GlassCard className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink dark:text-white">{c.subject}</h1>
              <Badge tone={complaintTone(c.status)}>{complaintLabel(c.status)}</Badge>
            </div>
            <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
              {[COMPLAINT_ABOUT[c.refType], c.against ? `about ${c.against.name}` : '', `filed ${formatDate(c.createdAt)}`].filter(Boolean).join(' · ')}
            </p>
            <p className="whitespace-pre-line text-sm text-ink dark:text-[#E8F1EB]">{c.description}</p>
          </GlassCard>

          {isClosed(c.status) ? (
            <GlassCard className="space-y-2">
              <h2 className="text-lg font-bold text-ink dark:text-white">The outcome</h2>
              <p className="whitespace-pre-line text-sm text-ink dark:text-[#E8F1EB]">{c.resolution || 'An administrator has closed this complaint.'}</p>
            </GlassCard>
          ) : (
            <Alert variant="info">An administrator will look into this. You will get a notification when something changes.</Alert>
          )}

          <GlassCard className="space-y-3">
            <h2 className="text-lg font-bold text-ink dark:text-white">What has happened so far</h2>
            <ol className="space-y-2">
              {c.timeline.map((t, i) => (
                <li key={`${t.status}-${i}`} className="flex flex-wrap items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]">
                  <Badge tone={complaintTone(t.status)}>{t.status === 'open' ? 'Filed' : complaintLabel(t.status)}</Badge>
                  <span className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(t.at)}</span>
                </li>
              ))}
            </ol>
          </GlassCard>
        </>
      )}
    </div>
  );
}
