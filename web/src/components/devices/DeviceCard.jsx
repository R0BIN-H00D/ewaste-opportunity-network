import { Link } from 'react-router-dom';
import { ImageOff, MapPin } from 'lucide-react';
import Badge from '../ui/Badge';
import Skeleton from '../ui/Skeleton';
import { assetUrl } from '../../services/api';
import { CONDITIONS, SERVICES, formatPrice, labelOf, photosOf, placeLabel } from '../../lib/devices';

const CONDITION_TONE = { fully_working: 'green', minor_damage: 'amber', major_damage: 'amber', not_working: 'red', for_spare_parts: 'neutral' };

export function Thumb({ listing, className = '' }) {
  const photo = photosOf(listing)[0];
  return (
    <div className={`relative overflow-hidden bg-primary/5 ${className}`}>
      {photo ? (
        <img src={assetUrl(photo.url)} alt={listing.title} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-ink-muted" role="img" aria-label="No photo">
          <ImageOff size={32} aria-hidden />
        </div>
      )}
    </div>
  );
}

export default function DeviceCard({ listing, layout = 'grid' }) {
  const place = placeLabel(listing);
  const list = layout === 'list';
  return (
    <article className={`glass overflow-hidden transition hover:-translate-y-0.5 hover:shadow-e2 ${list ? 'flex flex-col sm:flex-row' : 'flex flex-col'}`}>
      <Link to={`/devices/${listing._id}`} aria-label={`View ${listing.title}`} className={list ? 'sm:w-56 sm:shrink-0' : ''}>
        <Thumb listing={listing} className={list ? 'aspect-[4/3] sm:h-full' : 'aspect-[4/3]'} />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={CONDITION_TONE[listing.condition]}>{labelOf(CONDITIONS, listing.condition)}</Badge>
          <Badge tone="blue">{labelOf(SERVICES, listing.preferredService)}</Badge>
        </div>
        <h3 className="text-base font-bold leading-snug text-ink dark:text-white">
          <Link to={`/devices/${listing._id}`} className="hover:underline">{listing.title}</Link>
        </h3>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
          {[listing.category?.name, listing.brand, listing.model].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="font-numeric text-base font-bold text-primary dark:text-primary-tint">{formatPrice(listing.expectedPrice)}</span>
          {place && (
            <span className="flex min-w-0 items-center gap-1 text-xs text-ink-muted dark:text-[#9FB2A7]">
              <MapPin size={14} aria-hidden className="shrink-0" />
              <span className="truncate">{place}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function DeviceCardSkeleton({ layout = 'grid' }) {
  const list = layout === 'list';
  return (
    <div className={`glass overflow-hidden ${list ? 'flex flex-col sm:flex-row' : ''}`} aria-hidden>
      <Skeleton className={list ? 'aspect-[4/3] w-full sm:w-56' : 'aspect-[4/3] w-full'} />
      <div className="flex-1 space-y-3 p-4">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}
