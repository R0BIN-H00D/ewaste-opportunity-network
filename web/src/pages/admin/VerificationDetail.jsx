import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import DecisionActions from '../../components/admin/DecisionActions';
import DocumentViewer from '../../components/admin/DocumentViewer';
import History from '../../components/admin/History';
import { useFetch } from '../../hooks/useFetch';
import { adminVerificationApi } from '../../services/adminApi';
import { ORG_TYPE, ROLE_LABEL, accountLabel, accountTone, verificationLabel, verificationTone } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

const FACT_LABEL = {
  headline: 'Headline', city: 'City', state: 'State', experienceYears: 'Years of experience', specializations: 'Specialisations', qualifications: 'Qualifications',
  college: 'College', course: 'Course', yearOfStudy: 'Year of study', businessName: 'Business name', registrationNo: 'Registration number', description: 'About',
  centreName: 'Centre name', authorizationNo: 'Authorisation number', authorizingBody: 'Authorised by', organisationName: 'Organisation', organisationType: 'Type',
};

function factValue(key, value) {
  if (Array.isArray(value)) {
    if (!value.length) return '';
    return key === 'qualifications' ? value.map((q) => [q.title, q.institution, q.year].filter(Boolean).join(', ')).join('; ') : value.join(', ');
  }
  if (key === 'organisationType') return ORG_TYPE[value] || value;
  return value;
}

function Facts({ facts = {} }) {
  const rows = Object.entries(facts).map(([k, v]) => [k, factValue(k, v)]).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== 0);
  if (!rows.length) return <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">The applicant has not filled in their profile yet.</p>;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">{FACT_LABEL[k] || k}</dt>
          <dd className="font-medium text-ink dark:text-white">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One submission: who it is, what they say about themselves, the documents, and the decision. */
export default function VerificationDetail() {
  const { userId } = useParams();
  const [params] = useSearchParams();
  const type = params.get('type') === 'recipient' ? 'recipient' : 'provider';
  const { data, error, loading, reload } = useFetch((signal) => adminVerificationApi.get(userId, type, signal), [userId, type]);
  const [submission, setSubmission] = useState(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (data) setSubmission(data); }, [data]);
  const s = submission || data;

  return (
    <div className="space-y-4">
      <Link to={`/dashboard/admin/verifications${type === 'recipient' ? '?type=recipient' : ''}`} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-secondary-strong underline dark:text-primary-tint"><ArrowLeft size={14} aria-hidden /> Back to the queue</Link>
      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load this submission" />
      ) : loading && !s ? (
        <div className="space-y-3" aria-busy><Skeleton className="h-24 w-full !rounded-3xl" /><Skeleton className="h-48 w-full !rounded-3xl" /></div>
      ) : s && (
        <>
          <GlassCard className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink dark:text-white">{s.user.name}</h1>
              <Badge tone="neutral">{s.type === 'recipient' ? 'Recipient organisation' : ROLE_LABEL[s.role] || s.role}</Badge>
              <Badge tone={verificationTone(s.status)}>{verificationLabel(s.status)}</Badge>
              <Badge tone={accountTone(s.user.status)}>{accountLabel(s.user.status)}</Badge>
            </div>
            <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">
              {s.user.email}{s.user.phone ? ` · ${s.user.phone}` : ''} · joined {formatDate(s.user.joinedAt)}{s.user.emailVerified ? '' : ' · email not confirmed'}
            </p>
            {s.reason && <p className="text-sm text-ink dark:text-[#E8F1EB]"><span className="font-semibold">Last decision note:</span> {s.reason}</p>}
            {s.reviewedAt && <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Decided {formatDate(s.reviewedAt)}{s.reviewedBy?.name ? ` by ${s.reviewedBy.name}` : ''}</p>}
            {notice && <p role="status" className="text-sm font-semibold text-success">{notice}</p>}
            <DecisionActions submission={s} onDone={(updated) => { setSubmission(updated); setNotice('Decision saved. The applicant has been told.'); }} />
            <p className="text-xs"><Link to={`/dashboard/admin/users/${s.userId}`} className="inline-flex min-h-[44px] items-center font-semibold text-secondary-strong underline dark:text-primary-tint">Open this person’s account</Link></p>
          </GlassCard>

          <GlassCard className="space-y-3">
            <h2 className="text-lg font-bold text-ink dark:text-white">What they told us</h2>
            <Facts facts={s.facts} />
          </GlassCard>

          {s.type === 'provider' && (
            <GlassCard className="space-y-3">
              <h2 className="text-lg font-bold text-ink dark:text-white">Documents</h2>
              <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Opening a document is recorded in the audit trail.</p>
              <DocumentViewer documents={s.documents} />
            </GlassCard>
          )}

          <GlassCard className="space-y-3">
            <h2 className="text-lg font-bold text-ink dark:text-white">History</h2>
            <History items={s.history} />
          </GlassCard>
        </>
      )}
    </div>
  );
}
