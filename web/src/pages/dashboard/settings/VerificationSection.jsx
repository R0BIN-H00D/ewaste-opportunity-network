import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { FileText, Trash2 } from 'lucide-react';
import { verificationApi } from '../../../services/authApi';
import { useSave } from '../../../hooks/useSave';
import { loadMe } from '../../../store/authSlice';
import { toApiError } from '../../../utils/errors';
import Alert from '../../../components/ui/Alert';
import StatusBadge from '../../../components/ui/StatusBadge';
import TextField from '../../../components/ui/TextField';
import Section from './Section';

const LABELS = {
  id_proof: 'ID proof',
  qualification: 'Qualification certificate',
  business: 'Business registration',
  authorization: 'Authorisation certificate',
  other: 'Other document',
};
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;

function Previews({ files }) {
  const urls = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-3" aria-label="Selected files">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="glass-subtle flex w-28 flex-col items-center gap-1 p-2 text-center">
          {urls[i] ? <img src={urls[i]} alt="" className="h-16 w-full rounded-lg object-cover" /> : <FileText aria-hidden size={40} className="my-3 text-secondary-strong dark:text-primary-tint" />}
          <span className="w-full truncate text-xs text-ink dark:text-white" title={f.name}>{f.name}</span>
        </li>
      ))}
    </ul>
  );
}

export default function VerificationSection() {
  const dispatch = useDispatch();
  const save = useSave();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [docType, setDocType] = useState('');
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState('');
  const input = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await verificationApi.status();
      setData(d);
      setDocType((cur) => cur || d.allowedDocTypes[0]);
    } catch (err) {
      setLoadError(toApiError(err).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const onPick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (picked.length > MAX_FILES) return setFileError(`Choose at most ${MAX_FILES} files at a time.`);
    const bad = picked.find((f) => !OK_TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) return setFileError(`"${bad.name}" must be a JPEG, PNG, WebP or PDF file up to 10 MB.`);
    setFileError('');
    return setFiles(picked);
  };

  const submit = async () => {
    if (!files.length) return setFileError('Choose at least one file.');
    const { ok } = await save.run(() => verificationApi.submit(docType, files), 'Documents submitted. An administrator will review them.');
    if (ok) {
      setFiles([]);
      await load();
      dispatch(loadMe());
    }
    return undefined;
  };

  const remove = async (id) => {
    const { ok } = await save.run(() => verificationApi.remove(id), 'Document deleted');
    if (ok) {
      await load();
      dispatch(loadMe());
    }
  };

  if (loadError) return <Section id="verification" title="Verification"><Alert variant="error">{loadError}</Alert></Section>;
  if (!data) return <Section id="verification" title="Verification"><div className="skeleton h-3 w-40" aria-hidden /><span className="sr-only">Loading…</span></Section>;

  return (
    <Section
      id="verification"
      title="Verification"
      description="An administrator checks your documents before you can use provider features. Files are stored privately."
      save={save}
    >
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink dark:text-white">
        Status: <StatusBadge status={data.status} />
        {data.status === 'rejected' && data.reason && <span className="text-ink-muted dark:text-[#9FB2A7]">Reason: {data.reason}</span>}
      </p>

      {data.documents.length > 0 && (
        <ul className="divide-y divide-black/10 dark:divide-white/10" aria-label="Submitted documents">
          {data.documents.map((d) => (
            <li key={d._id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink dark:text-white">{LABELS[d.docType] || d.docType} <span className="font-normal text-ink-muted dark:text-[#9FB2A7]">· {d.file.originalName}</span></p>
                <p className="mt-0.5"><StatusBadge status={d.status} /></p>
              </div>
              {d.status !== 'approved' && (
                <button type="button" className="btn btn-glass !min-h-[40px] !px-3" onClick={() => remove(d._id)} disabled={save.saving} aria-label={`Delete ${d.file.originalName}`}>
                  <Trash2 size={16} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.status !== 'approved' && (
        <div className="space-y-3">
          <TextField as="select" label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {data.allowedDocTypes.map((t) => <option key={t} value={t}>{LABELS[t] || t}</option>)}
          </TextField>
          <div>
            <input ref={input} type="file" multiple accept={OK_TYPES.join(',')} className="hidden" onChange={onPick} aria-label="Choose document files" />
            <button type="button" className="btn btn-glass" onClick={() => input.current?.click()}>Choose files (up to {MAX_FILES})</button>
          </div>
          <Alert variant="error">{fileError}</Alert>
          <Previews files={files} />
          <button type="button" className="btn btn-primary" onClick={submit} disabled={save.saving || !files.length}>
            {save.saving ? 'Uploading…' : 'Submit for review'}
          </button>
        </div>
      )}
    </Section>
  );
}
