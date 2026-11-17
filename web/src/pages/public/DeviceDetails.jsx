import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Flag, ImageOff, MapPin, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Skeleton from '../../components/ui/Skeleton';
import ReportDialog from '../../components/devices/ReportDialog';
import MessageButton from '../../components/chat/MessageButton';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../hooks/useAuth';
import { deviceApi } from '../../services/deviceApi';
import { assetUrl } from '../../services/api';
import { friendlyMessage, toApiError } from '../../utils/errors';
import { CONDITIONS, LISTING_STATUS, PICKUPS, SERVICES, formatPrice, labelOf, photosOf, placeLabel } from '../../lib/devices';

function Row({ label, children }) {
  if (!children) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-black/5 py-2 text-sm last:border-0 dark:border-white/10">
      <dt className="text-ink-muted dark:text-[#9FB2A7]">{label}</dt>
      <dd className="text-right font-medium text-ink dark:text-white">{children}</dd>
    </div>
  );
}

export default function DeviceDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isChecking, user } = useAuth();
  // What the server returns depends on who is asking (owner view has exact location, edit rights…),
  // so wait for the session check and re-fetch when the signed-in person changes.
  const { data: listing, error, loading, reload } = useFetch((signal) => deviceApi.get(id, signal), [id, user?.id || ''], { enabled: !isChecking });
  const [active, setActive] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  if (loading && !listing) {
    return (
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-2" aria-busy>
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-5 w-1/3" /><Skeleton className="h-32 w-full" /></div>
      </div>
    );
  }
  if (error) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="px-4 py-16">
        <ErrorState
          error={missing ? { message: 'This listing does not exist or is no longer available.' } : error}
          title={missing ? 'Listing not found' : 'Could not load this listing'}
          onRetry={missing ? undefined : reload}
        />
        <p className="mt-4 text-center"><Link to="/browse" className="font-semibold text-primary underline dark:text-primary-tint">Back to browse</Link></p>
      </div>
    );
  }

  const photos = photosOf(listing);
  const current = photos[Math.min(active, photos.length - 1)];
  const place = placeLabel(listing);
  const isLive = listing.status === 'listed';

  const remove = async () => {
    setBusy(true);
    setActionError('');
    try {
      await deviceApi.remove(listing._id);
      navigate('/dashboard/listings', { replace: true, state: { removed: listing.title } });
    } catch (err) {
      setActionError(friendlyMessage(toApiError(err)));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/browse" className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint">
        <ArrowLeft size={16} aria-hidden /> Back to browse
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <section aria-label="Photos">
          <div className="glass aspect-[4/3] overflow-hidden">
            {current ? (
              <img src={assetUrl(current.url)} alt={`${listing.title}, photo ${Math.min(active, photos.length - 1) + 1} of ${photos.length}`} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-ink-muted" role="img" aria-label="No photos yet"><ImageOff size={48} aria-hidden /></div>
            )}
          </div>
          {photos.length > 1 && (
            <ul className="mt-3 flex gap-2 overflow-x-auto" aria-label="Photo thumbnails">
              {photos.map((p, i) => (
                <li key={p.publicId || p.url}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Show photo ${i + 1}`}
                    aria-current={i === active ? 'true' : undefined}
                    className={`h-16 w-20 overflow-hidden rounded-xl border-2 ${i === active ? 'border-secondary-strong' : 'border-transparent opacity-80'}`}
                  >
                    <img src={assetUrl(p.url)} alt="" className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="blue">{labelOf(SERVICES, listing.preferredService)}</Badge>
            <Badge tone={listing.condition === 'fully_working' ? 'green' : 'amber'}>{labelOf(CONDITIONS, listing.condition)}</Badge>
            {!isLive && <Badge tone="neutral">{LISTING_STATUS[listing.status] || listing.status}</Badge>}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-ink dark:text-white">{listing.title}</h1>
          <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{[listing.category?.name, listing.brand, listing.model].filter(Boolean).join(' · ')}</p>
          <p className="mt-4 font-numeric text-3xl font-bold text-primary dark:text-primary-tint">{formatPrice(listing.expectedPrice)}</p>

          {listing.description && <p className="mt-4 whitespace-pre-line text-ink dark:text-[#E8F1EB]">{listing.description}</p>}

          <dl className="glass mt-5 px-5 py-2">
            <Row label="Brand">{listing.brand}</Row>
            <Row label="Model">{listing.model}</Row>
            <Row label="Purchase year">{listing.device?.purchaseYear}</Row>
            <Row label="Age">{listing.device?.ageYears != null ? `${listing.device.ageYears} years` : ''}</Row>
            <Row label="Handover">{listing.pickupPreference ? labelOf(PICKUPS, listing.pickupPreference) : ''}</Row>
            <Row label="Listed by">{listing.owner?.name}</Row>
            <Row label="Views">{listing.isOwner ? String(listing.viewCount ?? 0) : ''}</Row>
          </dl>

          {place && (
            <p className="mt-4 flex items-start gap-2 text-sm text-ink-muted dark:text-[#9FB2A7]">
              <MapPin size={18} aria-hidden className="mt-0.5 shrink-0" />
              <span>Approximate area: <strong className="text-ink dark:text-white">{place}</strong>. The exact address is shared only after a request is accepted.</span>
            </p>
          )}

          <Alert variant="error" className="mt-4">{actionError}</Alert>

          {listing.isOwner ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={`/dashboard/listings/${listing._id}/edit`} className="btn btn-primary"><Pencil size={16} aria-hidden /> Edit listing</Link>
              <button type="button" className="btn btn-glass" onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden /> Delete</button>
            </div>
          ) : (
            <div className="glass-subtle mt-6 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold text-ink dark:text-white"><ShieldCheck size={18} aria-hidden /> Interested in this device?</p>
              <p className="mt-1 text-ink-muted dark:text-[#9FB2A7]">
                Requests for repair, reuse, donation and recycling open with the service modules. Meanwhile you can{' '}
                <Link to="/services" className="font-semibold text-primary underline dark:text-primary-tint">find a service provider</Link>.
              </p>
              {isAuthenticated && isLive && (
                <div className="mt-3">
                  <MessageButton contextType="enquiry" contextId={listing._id} label={`Ask ${listing.owner?.name || 'the owner'} a question`} />
                </div>
              )}
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted underline hover:text-danger"
                onClick={() => (isAuthenticated ? setReporting(true) : navigate('/login'))}
              >
                <Flag size={14} aria-hidden /> {isAuthenticated ? 'Report this listing' : 'Log in to report this listing'}
              </button>
            </div>
          )}
        </section>
      </div>

      <ReportDialog open={reporting} onClose={() => setReporting(false)} listingId={listing._id} />
      <ConfirmDialog open={confirmDelete} danger busy={busy} title="Delete this listing?" confirmLabel="Delete" onConfirm={remove} onCancel={() => setConfirmDelete(false)}>
        “{listing.title}” will be removed from the platform. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
