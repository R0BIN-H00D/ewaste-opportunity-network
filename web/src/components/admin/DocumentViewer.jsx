import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import { adminVerificationApi } from '../../services/adminApi';
import { toApiError } from '../../utils/errors';
import { docLabel, fileSize, verificationLabel, verificationTone } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

/** Loads one private document with the administrator's own session and shows it. Nothing here is a shareable link. */
function Preview({ doc }) {
  const [state, setState] = useState({ url: '', error: '' });
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    adminVerificationApi
      .document(doc.viewUrl, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, error: '' });
      })
      .catch((err) => {
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
        setState({ url: '', error: toApiError(err).message });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.viewUrl]);

  if (state.error) return <Alert variant="error">{state.error}</Alert>;
  if (!state.url) return <p className="py-8 text-center text-sm text-ink-muted dark:text-[#9FB2A7]" role="status">Opening the document…</p>;
  if (doc.file?.mime === 'application/pdf') return <iframe title={`${docLabel(doc.docType)} (PDF)`} src={state.url} className="h-[60vh] w-full rounded-xl border border-white/40 bg-white" />;
  return <img src={state.url} alt={`${docLabel(doc.docType)} submitted by the applicant`} className="mx-auto max-h-[60vh] max-w-full rounded-xl" />;
}

/** The documents an applicant sent. Each opens in a dialog and every opening is written to the audit trail by the server. */
export default function DocumentViewer({ documents = [] }) {
  const [open, setOpen] = useState(null);
  if (!documents.length) return <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">No documents were sent.</p>;
  return (
    <>
      <ul className="space-y-2">
        {documents.map((d) => (
          <li key={d._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/30 bg-white/30 px-3 py-2 dark:bg-white/5">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-white"><FileText size={16} aria-hidden />{docLabel(d.docType)}</p>
              <p className="truncate text-xs text-ink-muted dark:text-[#9FB2A7]">{d.file?.originalName} · {fileSize(d.file?.bytes)} · sent {formatDate(d.submittedAt)}</p>
              {d.reason && <p className="text-xs text-ink dark:text-[#E8F1EB]">Note: {d.reason}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={verificationTone(d.status)}>{verificationLabel(d.status)}</Badge>
              <button type="button" className="btn btn-glass !px-3 !py-1.5 text-sm" onClick={() => setOpen(d)} aria-label={`View ${docLabel(d.docType)}`}>View</button>
            </div>
          </li>
        ))}
      </ul>
      <Modal size="xl" open={!!open} onClose={() => setOpen(null)} title={open ? docLabel(open.docType) : ''} footer={<button type="button" className="btn btn-glass" onClick={() => setOpen(null)}>Close</button>}>
        {open && <Preview doc={open} />}
      </Modal>
    </>
  );
}
