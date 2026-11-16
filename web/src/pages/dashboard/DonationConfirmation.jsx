import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import { useFetch } from '../../hooks/useFetch';
import { donationApi } from '../../services/donationApi';
import { CONDITIONS, labelOf } from '../../lib/devices';
import { ORG_TYPES } from '../../lib/donations';
import { formatDate } from '../../lib/requests';

/** Printable donation confirmation (FR-DON-006). "Print" lets the browser save it as a PDF. */
export default function DonationConfirmation() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch((signal) => donationApi.confirmation(id, signal), [id]);

  if (loading && !data) return <div className="space-y-4" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  if (error && !data) {
    const missing = [404, 409, 422].includes(error.status);
    return (
      <div className="space-y-4">
        <ErrorState error={missing ? { message: 'The confirmation is available once both sides have confirmed the handover.' } : error} title={missing ? 'No confirmation yet' : 'Could not load the confirmation'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to={`/dashboard/donations/${id}`} className="font-semibold text-primary underline dark:text-primary-tint">Back to the donation</Link></p>
      </div>
    );
  }

  const orgType = ORG_TYPES.find(([k]) => k === data.recipient?.orgType)?.[1];
  const rows = [
    ['Device', [data.device.title, [data.device.brand, data.device.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')],
    ['Category', data.device.category],
    ['Condition', labelOf(CONDITIONS, data.device.condition)],
    ['Donor', data.donor.name],
    ['Recipient', [data.recipient.orgName || data.recipient.name, orgType].filter(Boolean).join(' · ')],
    ['Handover date', formatDate(data.handoverDate)],
    ['Donor confirmed', formatDate(data.confirmedAt.donor)],
    ['Recipient confirmed', formatDate(data.confirmedAt.recipient)],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/dashboard/donations/${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Back to the donation</Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}><Printer size={16} aria-hidden /> Print or save as PDF</button>
      </div>
      <GlassCard as="article" aria-label="Donation confirmation" className="mx-auto max-w-2xl space-y-5 print:max-w-none print:shadow-none">
        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]">E-Waste-to-Opportunity Network</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink dark:text-white">Donation confirmation</h1>
          <p className="mt-2 text-sm text-ink-muted dark:text-[#9FB2A7]">Reference</p>
          <p className="font-numeric text-3xl font-extrabold text-primary dark:text-primary-tint">{data.refNo}</p>
          <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Issued {formatDate(data.issuedAt)}</p>
        </header>
        <dl className="divide-y divide-black/10 text-sm dark:divide-white/15">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 py-2">
              <dt className="text-ink-muted dark:text-[#9FB2A7]">{k}</dt>
              <dd className="font-semibold text-ink dark:text-white">{v || '–'}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{data.statement}</p>
      </GlassCard>
    </div>
  );
}
