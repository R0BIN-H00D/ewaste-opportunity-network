import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { chatApi } from '../../services/chatApi';
import { toApiError } from '../../utils/errors';

/**
 * A "Message" button for a repair, order, donation request, recycling request, refurbishment offer or listing.
 * It asks the server for the thread (which works out who the other person is, so nobody can message a stranger) and opens it.
 * `contextType` is one of service, order, recycling, donation, offer, enquiry.
 */
export default function MessageButton({ contextType, contextId, label = 'Message', className = 'btn btn-glass' }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = async () => {
    setBusy(true);
    setError('');
    try {
      const conversation = await chatApi.open(contextType, contextId);
      navigate(`/dashboard/messages/${conversation._id}`);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" className={className} onClick={open} disabled={busy}>
        <MessageCircle size={16} aria-hidden /> {busy ? 'Opening...' : label}
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
