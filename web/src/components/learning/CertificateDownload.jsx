import { Download } from 'lucide-react';
import { useSave } from '../../hooks/useSave';
import { saveBlob } from '../../lib/download';
import { certificateApi } from '../../services/learningApi';

/** Downloads a certificate as a PDF. The file comes from the server with the signed-in session, never from a public link. */
export default function CertificateDownload({ id, certNo }) {
  const save = useSave();
  const click = async () => {
    const res = await save.run(() => certificateApi.download(id), 'Downloaded');
    if (res.ok) saveBlob(res.result.blob, res.result.filename);
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" className="btn btn-glass !px-3 !py-1.5 text-sm" onClick={click} disabled={save.saving} aria-label={`Download certificate ${certNo} as PDF`}>
        <Download size={14} aria-hidden /> {save.saving ? 'Preparing...' : 'Download PDF'}
      </button>
      {save.status === 'error' && <span role="alert" className="text-xs text-danger">{save.message}</span>}
    </span>
  );
}