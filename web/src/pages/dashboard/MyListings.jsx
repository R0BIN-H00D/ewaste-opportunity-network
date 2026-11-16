import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, Heart, PackagePlus, Pencil, Recycle, Trash2, Wrench } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { Thumb } from '../../components/devices/DeviceCard';
import { useFetch } from '../../hooks/useFetch';
import { deviceApi } from '../../services/deviceApi';
import { donationApi } from '../../services/donationApi';
import { friendlyMessage, toApiError } from '../../utils/errors';
import { LISTING_STATUS, SERVICES, formatPrice, labelOf } from '../../lib/devices';

const TABS = [['', 'All'], ['listed', 'Listed'], ['draft', 'Drafts'], ['withdrawn', 'Withdrawn'], ['in_service', 'In service']];
const TONE = { listed: 'green', draft: 'neutral', withdrawn: 'amber', in_service: 'blue', completed: 'green', removed_by_admin: 'red' };
const LOCKED = ['in_service', 'completed', 'removed_by_admin'];

export default function MyListings() {
  const location = useLocation();
  const navigate = useNavigate();
  const [offering, setOffering] = useState(null); // listing being offered as a donation
  const [offerNote, setOfferNote] = useState('');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [problem, setProblem] = useState('');
  const [pending, setPending] = useState(null); // listing awaiting delete confirmation
  const [busyId, setBusyId] = useState('');

  const { data, error, loading, reload } = useFetch(
    (signal) => deviceApi.list({ mine: 'true', status, page, limit: 8, sort: 'newest' }, signal),
    [status, page],
  );
  const items = data?.items || [];
  const meta = data?.meta;

  const pick = (next) => setParams(next ? { status: next } : {});

  const changeStatus = async (listing, next, doneMessage) => {
    setBusyId(listing._id);
    setProblem('');
    setFlash('');
    try {
      await deviceApi.setStatus(listing._id, next);
      setFlash(doneMessage);
      reload();
    } catch (err) {
      setProblem(friendlyMessage(toApiError(err)));
    } finally {
      setBusyId('');
    }
  };

  const confirmOffer = async () => {
    const listing = offering;
    setBusyId(listing._id);
    setProblem('');
    try {
      const donation = await donationApi.create({ listingId: listing._id, ...(offerNote.trim() ? { description: offerNote.trim() } : {}) });
      navigate(`/dashboard/donations/${donation._id}`, { state: { flash: 'Your device is now offered to verified organisations.' } });
    } catch (err) {
      setProblem(friendlyMessage(toApiError(err)));
      setOffering(null);
    } finally {
      setBusyId('');
    }
  };

  const confirmDelete = async () => {
    const listing = pending;
    setBusyId(listing._id);
    setProblem('');
    try {
      await deviceApi.remove(listing._id);
      setFlash(`“${listing.title}” was deleted.`);
      setPending(null);
      if (items.length === 1 && page > 1) setParams({ ...(status ? { status } : {}), page: String(page - 1) });
      else reload();
    } catch (err) {
      setProblem(friendlyMessage(toApiError(err)));
      setPending(null);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">My listings</h1>
        <Link to="/list-device" className="btn btn-primary"><PackagePlus size={16} aria-hidden /> List a device</Link>
      </div>

      <Alert variant="success">{flash}</Alert>
      <Alert variant="error">{problem}</Alert>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {TABS.map(([value, label]) => (
          <button
            key={value || 'all'}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => pick(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${status === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted hover:text-ink dark:hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load your listings" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title={status ? 'Nothing here yet' : 'You have not listed anything yet'}
          action={<Link to="/list-device" className="btn btn-primary">List your first device</Link>}
        >
          {status ? 'No listings with this status.' : 'List a device to repair it, donate it or send it to a responsible recycler.'}
        </EmptyState>
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {items.map((l) => {
            const locked = LOCKED.includes(l.status);
            const busy = busyId === l._id;
            return (
              <li key={l._id}>
                <GlassCard className="flex flex-col gap-4 !p-4 sm:flex-row sm:items-center">
                  <Thumb listing={l} className="h-24 w-full shrink-0 rounded-2xl sm:w-32" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-ink dark:text-white">{l.title}</h2>
                      <Badge tone={TONE[l.status]}>{LISTING_STATUS[l.status] || l.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">
                      {labelOf(SERVICES, l.preferredService)} · {formatPrice(l.expectedPrice)} · {l.viewCount ?? 0} views
                    </p>
                    {locked && <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">This listing is part of a service and cannot be changed.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {l.status === 'listed' && <Link to={`/devices/${l._id}`} className="btn btn-glass !px-3" aria-label={`View ${l.title}`}><Eye size={16} aria-hidden /></Link>}
                    {l.status === 'listed' && l.preferredService === 'repair' && <Link to={`/dashboard/requests/new?listing=${l._id}`} className="btn btn-primary"><Wrench size={16} aria-hidden /> Find a technician</Link>}
                    {l.status === 'listed' && l.preferredService === 'recycling' && <Link to={`/dashboard/recycling/new?listing=${l._id}`} className="btn btn-primary"><Recycle size={16} aria-hidden /> Find a recycling centre</Link>}
                    {l.status === 'listed' && l.preferredService === 'donation' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { setOfferNote(''); setOffering(l); }}><Heart size={16} aria-hidden /> Offer for donation</button>}
                    {!locked && <Link to={`/dashboard/listings/${l._id}/edit`} className="btn btn-glass !px-3" aria-label={`Edit ${l.title}`}><Pencil size={16} aria-hidden /></Link>}
                    {l.status === 'listed' && <button type="button" className="btn btn-glass" disabled={busy} onClick={() => changeStatus(l, 'withdrawn', `“${l.title}” was withdrawn.`)}>Withdraw</button>}
                    {(l.status === 'draft' || l.status === 'withdrawn') && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => changeStatus(l, 'listed', `“${l.title}” is live.`)}>{l.status === 'draft' ? 'Publish' : 'Relist'}</button>}
                    {!locked && <button type="button" className="btn btn-glass !px-3" disabled={busy} aria-label={`Delete ${l.title}`} onClick={() => setPending(l)}><Trash2 size={16} aria-hidden /></button>}
                  </div>
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}

      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={(n) => setParams({ ...(status ? { status } : {}), ...(n > 1 ? { page: String(n) } : {}) })} />}

      <ConfirmDialog open={Boolean(offering)} busy={busyId === offering?._id} title="Offer this device for donation?" confirmLabel="Offer device" onConfirm={confirmOffer} onCancel={() => setOffering(null)}>
        <p className="mb-3 text-sm text-ink dark:text-[#E8F1EB]">“{offering?.title}” will appear in the donation marketplace. Verified schools and organisations can ask for it, and you choose who receives it.</p>
        <TextField as="textarea" rows={3} label="Message for recipients (optional)" value={offerNote} onChange={(e) => setOfferNote(e.target.value)} maxLength={1000} />
      </ConfirmDialog>
      <ConfirmDialog open={Boolean(pending)} danger busy={busyId === pending?._id} title="Delete this listing?" confirmLabel="Delete" onConfirm={confirmDelete} onCancel={() => setPending(null)}>
        “{pending?.title}” will be removed from the platform. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
