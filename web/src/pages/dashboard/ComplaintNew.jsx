import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import TextField from '../../components/ui/TextField';
import { useSave } from '../../hooks/useSave';
import { complaintApi } from '../../services/complaintApi';
import { COMPLAINT_ABOUT } from '../../lib/complaints';
import { friendlyMessage } from '../../utils/errors';

const FIELDS = ['subject', 'description', 'against', 'refType', 'refId'];

function validate(v) {
  const e = {};
  if (v.subject.trim().length < 5) e.subject = 'Use at least 5 characters.';
  if (v.description.trim().length < 10) e.description = 'Tell us a little more (at least 10 characters).';
  return e;
}

/**
 * File a complaint. A link from another page can fill in who or what it is about (?against=<id>&name=<name>&refType=&refId=),
 * so the person does not have to find an id themselves.
 */
export default function ComplaintNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const against = params.get('against') || '';
  const againstName = params.get('name') || '';
  const refId = params.get('refId') || '';
  const save = useSave();
  const [values, setValues] = useState({ subject: '', description: '', about: COMPLAINT_ABOUT[params.get('refType')] ? params.get('refType') : against ? 'user' : 'other' });
  const [errors, setErrors] = useState({});

  const set = (name) => (e) => { setValues((v) => ({ ...v, [name]: e.target.value })); setErrors((er) => ({ ...er, [name]: undefined })); if (save.status === 'error') save.reset(); };

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    const body = {
      subject: values.subject.trim(),
      description: values.description.trim(),
      refType: values.about,
      ...(against ? { against } : {}),
      ...(refId && values.about !== 'other' ? { refId } : {}),
    };
    const res = await save.run(() => complaintApi.create(body), 'Filed');
    if (res.ok) navigate(`/dashboard/complaints/${res.result._id}`, { state: { flash: 'Your complaint was filed. We will keep you posted.' } });
  };

  // Field problems come straight from the failed save, so they never flash in the banner first.
  const serverFields = save.status === 'error' ? Object.fromEntries(Object.entries(save.error?.fieldErrors || {}).filter(([k]) => FIELDS.includes(k))) : {};
  const shown = Object.values(errors).some(Boolean) ? errors : serverFields;
  const banner = save.status === 'error' && !Object.values(shown).some(Boolean) ? friendlyMessage(save.error) : '';
  return (
    <div className="space-y-4">
      <Link to="/dashboard/complaints" className="inline-flex items-center gap-1 text-sm font-semibold text-secondary-strong underline dark:text-primary-tint"><ArrowLeft size={14} aria-hidden /> Back to complaints</Link>
      <h1 className="text-2xl font-bold text-ink dark:text-white">File a complaint</h1>
      <GlassCard>
        <form onSubmit={submit} noValidate className="space-y-4" aria-label="File a complaint">
          {againstName && <Alert variant="info">This complaint is about {againstName}.</Alert>}
          <TextField label="What is it about?" as="select" value={values.about} onChange={set('about')} error={shown.refType}>
            {Object.entries(COMPLAINT_ABOUT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </TextField>
          <TextField label="Subject" value={values.subject} onChange={set('subject')} error={shown.subject} maxLength={140} hint="A short title, for example “Technician did not turn up”." />
          <TextField as="textarea" rows={6} label="What happened?" value={values.description} onChange={set('description')} error={shown.description} maxLength={2000} hint="Say what happened, when, and what you would like us to do. Do not include passwords or card numbers." />
          <Alert variant="error">{banner}</Alert>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={save.saving}>{save.saving ? 'Sending…' : 'File complaint'}</button>
            <Link to="/dashboard/complaints" className="btn btn-glass">Cancel</Link>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
