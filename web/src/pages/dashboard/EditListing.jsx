import { Link, useParams } from 'react-router-dom';
import DeviceForm from '../../components/devices/DeviceForm';
import ErrorState from '../../components/ui/ErrorState';
import PageLoader from '../../components/ui/PageLoader';
import { useFetch } from '../../hooks/useFetch';
import { deviceApi } from '../../services/deviceApi';

export default function EditListing() {
  const { id } = useParams();
  const { data: listing, error, loading, reload } = useFetch((signal) => deviceApi.get(id, signal), [id]);

  if (loading && !listing) return <PageLoader label="Loading your listing…" />;
  if (error) {
    const missing = error.status === 404 || error.status === 422;
    return <ErrorState error={missing ? { message: 'This listing does not exist.' } : error} title={missing ? 'Listing not found' : 'Could not load this listing'} onRetry={missing ? undefined : reload} />;
  }
  if (!listing.isOwner) {
    return <ErrorState title="Not your listing" error={{ message: 'You can only edit listings you created.' }} />;
  }
  if (['in_service', 'completed', 'removed_by_admin'].includes(listing.status)) {
    return (
      <ErrorState title="This listing cannot be edited" error={{ message: `A listing that is ${listing.status.replace(/_/g, ' ')} is locked.` }} />
    );
  }
  return (
    <div>
      <Link to="/dashboard/listings" className="mb-4 inline-block text-sm font-medium text-primary dark:text-primary-tint">← Back to my listings</Link>
      <h1 className="mb-4 text-2xl font-bold text-ink dark:text-white">Edit “{listing.title}”</h1>
      <DeviceForm key={listing._id} mode="edit" listing={listing} />
    </div>
  );
}
