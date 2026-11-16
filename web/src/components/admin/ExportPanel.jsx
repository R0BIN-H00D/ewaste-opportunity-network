import { useState } from 'react';
import { Download } from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import Alert from '../ui/Alert';
import TextField from '../ui/TextField';
import { useSave } from '../../hooks/useSave';
import { adminExportApi } from '../../services/adminApi';
import { saveBlob } from '../../lib/download';
import { ROLES } from '../../lib/admin';
import { ACCOUNT_STATUS_OPTIONS, EXPORTS, LISTING_STATUS_OPTIONS, number } from '../../lib/analytics';
import { friendlyMessage } from '../../utils/errors';

const MAX_ROWS = 10000; // the server's cap; it says when a file was cut short

/**
 * Download one CSV. Each export offers only the filters it can apply (the server refuses the others), the file comes through
 * the signed-in session, and the server writes every download to the audit log.
 */
export default function ExportPanel() {
  const save = useSave();
  const [kind, setKind] = useState('users');
  const [filters, setFilters] = useState({ role: '', status: '', from: '', to: '' });
  const [rangeError, setRangeError] = useState('');
  const [done, setDone] = useState(null); // { filename, rows, truncated }
  const spec = EXPORTS.find((e) => e.kind === kind);
  const has = (f) => spec.filters.includes(f);

  const change = (name) => (e) => {
    setFilters((f) => ({ ...f, [name]: e.target.value }));
    setRangeError('');
    setDone(null);
    if (save.status === 'error') save.reset();
  };
  const changeKind = (e) => {
    setKind(e.target.value);
    setFilters((f) => ({ ...f, role: '', status: '' })); // another export does not take them
    setRangeError('');
    setDone(null);
    save.reset();
  };

  const submit = async () => {
    if (filters.from && filters.to && filters.to < filters.from) { setRangeError('The end date must not be before the start date.'); return; }
    setRangeError('');
    setDone(null);
    const params = {
      ...(has('role') ? { role: filters.role } : {}),
      ...(has('status') ? { status: filters.status } : {}),
      ...(has('dates') ? { from: filters.from, to: filters.to } : {}),
    };
    const res = await save.run(() => adminExportApi.download(kind, params), 'Downloaded');
    if (res.ok) {
      saveBlob(res.result.blob, res.result.filename);
      setDone({ filename: res.result.filename, rows: res.result.rows, truncated: res.result.truncated });
    }
  };

  return (
    <GlassCard as="section" aria-labelledby="export-title" className="space-y-4">
      <div>
        <h2 id="export-title" className="text-lg font-bold text-ink dark:text-white">Download data</h2>
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">A CSV file opens in Excel and Google Sheets. Choose what you need and, if you like, narrow it down.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField as="select" label="What to download" value={kind} onChange={changeKind}>
          {EXPORTS.map((e) => <option key={e.kind} value={e.kind}>{e.label}</option>)}
        </TextField>
        {kind === 'users' && (
          <TextField as="select" label="Role" value={filters.role} onChange={change('role')}>
            <option value="">Any role</option>
            {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </TextField>
        )}
        {has('status') && (
          <TextField as="select" label="Status" value={filters.status} onChange={change('status')}>
            <option value="">{kind === 'users' ? 'Any except deleted' : 'Any except drafts'}</option>
            {(kind === 'users' ? ACCOUNT_STATUS_OPTIONS : LISTING_STATUS_OPTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </TextField>
        )}
        {has('dates') && (
          <>
            <TextField label="From" type="date" value={filters.from} onChange={change('from')} />
            <TextField label="To" type="date" value={filters.to} onChange={change('to')} />
          </>
        )}
      </div>

      <p className="text-sm text-ink dark:text-[#E8F1EB]">{spec.note} Every download is recorded in the audit log.</p>
      {rangeError && <p role="alert" className="text-sm text-danger dark:text-red-300">{rangeError}</p>}
      <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
      {done && <Alert variant="success">{`Downloaded ${done.filename} with ${number(done.rows)} ${done.rows === 1 ? 'row' : 'rows'}.`}</Alert>}
      {done?.truncated && <Alert variant="info">{`Only the first ${number(MAX_ROWS)} rows are in this file. Choose a shorter date range to get the rest.`}</Alert>}

      <button type="button" className="btn btn-primary" disabled={save.saving} onClick={submit}>
        <Download size={18} aria-hidden /> {save.saving ? 'Preparing…' : 'Download CSV'}
      </button>
    </GlassCard>
  );
}
