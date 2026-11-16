import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { recipientApi } from '../../services/donationApi';
import { ORG_TYPES, VERIFICATION } from '../../lib/donations';
import { applyFieldErrors, friendlyMessage } from '../../utils/errors';

/** Register a school, college or charity so it can request donated devices (A-02). An administrator verifies it. */
export default function RecipientOrg() {
  const { data, error, loading, reload } = useFetch((signal) => recipientApi.status(signal), []);
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ orgType: '', orgName: '', registrationNo: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const save = useSave();
  const current = status || data;

  useEffect(() => {
    if (data) setForm({ orgType: data.orgType || '', orgName: data.orgName || '', registrationNo: data.registrationNo || '' });
  }, [data]);

  if (error && !current) return <ErrorState error={error} onRetry={reload} title="Could not load your organisation" />;
  if (loading && !current) return <div className="space-y-4" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-56 w-full !rounded-3xl" /></div>;

  const [label, tone] = VERIFICATION[current.status] || [current.status, 'neutral'];
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const problems = {};
    if (!form.orgType) problems.orgType = 'Choose the type of organisation.';
    if (form.orgName.trim().length < 2) problems.orgName = 'Enter the organisation name.';
    if (form.registrationNo.trim().length < 3) problems.registrationNo = 'Enter the registration number.';
    setFieldErrors(problems);
    if (Object.keys(problems).length) return;
    const res = await save.run(() => recipientApi.apply({ orgType: form.orgType, orgName: form.orgName.trim(), registrationNo: form.registrationNo.trim() }), 'Sent for verification');
    if (res.ok) setStatus(res.result);
    else applyFieldErrors(res.error, (name, v) => setFieldErrors((f) => ({ ...f, [name]: v.message })), ['orgType', 'orgName', 'registrationNo']);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Recipient organisation</h1>
      <GlassCard className="space-y-3">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink dark:text-white"><Building2 size={18} aria-hidden /> Verification status <Badge tone={tone}>{label}</Badge></p>
        {current.status === 'approved' && <p className="text-sm text-ink dark:text-[#E8F1EB]">{current.orgName} is verified. You can request devices from the <Link to="/donations" className="font-semibold text-primary underline dark:text-primary-tint">donation marketplace</Link>.</p>}
        {current.status === 'pending' && <p className="text-sm text-ink dark:text-[#E8F1EB]">An administrator is reviewing your details. You can correct them below while you wait.</p>}
        {current.reason && ['rejected', 'resubmission_required'].includes(current.status) && <Alert variant="error">{current.reason}</Alert>}
        {current.status === 'not_submitted' && <p className="text-sm text-ink dark:text-[#E8F1EB]">Schools, colleges, NGOs and charities can ask donors for devices. Tell us about your organisation and an administrator will verify it.</p>}
      </GlassCard>

      {current.status !== 'approved' && (
        <GlassCard as="section" aria-label="Organisation details">
          <form onSubmit={submit} noValidate className="space-y-4">
            <Alert variant="success">{save.status === 'saved' ? 'Your organisation was sent for verification.' : ''}</Alert>
            <Alert variant="error">{save.status === 'error' && !Object.keys(fieldErrors).length ? friendlyMessage(save.error) : ''}</Alert>
            <TextField as="select" label="Type of organisation" value={form.orgType} onChange={set('orgType')} error={fieldErrors.orgType}>
              <option value="">Choose…</option>
              {ORG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </TextField>
            <TextField label="Organisation name" value={form.orgName} onChange={set('orgName')} maxLength={150} error={fieldErrors.orgName} />
            <TextField label="Registration number" value={form.registrationNo} onChange={set('registrationNo')} maxLength={60} error={fieldErrors.registrationNo} hint="For example the school affiliation number or NGO registration number." />
            <button type="submit" className="btn btn-primary" disabled={save.saving}>{save.saving ? 'Sending…' : current.status === 'not_submitted' ? 'Send for verification' : 'Update details'}</button>
          </form>
        </GlassCard>
      )}
    </div>
  );
}
