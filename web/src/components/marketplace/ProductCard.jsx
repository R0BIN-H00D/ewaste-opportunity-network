import { Link } from 'react-router-dom';
import { ImageOff, Star, Store } from 'lucide-react';
import Badge from '../ui/Badge';
import Skeleton from '../ui/Skeleton';
import { assetUrl } from '../../services/api';
import { PRODUCT_CONDITIONS, PRODUCT_STATUS } from '../../lib/marketplace';
import { formatMoney } from '../../lib/requests';
import { labelOf } from '../../lib/devices';

export function ProductThumb({ product, className = '' }) {
  const photo = product.photos?.[0];
  return (
    <div className={`relative overflow-hidden bg-primary/5 ${className}`}>
      {photo ? (
        <img src={assetUrl(photo.url)} alt={product.title} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-ink-muted" role="img" aria-label="No photo"><ImageOff size={32} aria-hidden /></div>
      )}
    </div>
  );
}

/** The two things every product must show (BR-11): the Refurbished label and its condition. */
export function ProductBadges({ product }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge tone="green">Refurbished</Badge>
      <Badge tone="blue">{labelOf(PRODUCT_CONDITIONS, product.condition)}</Badge>
    </div>
  );
}

export function SellerLine({ seller }) {
  if (!seller) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted dark:text-[#9FB2A7]">
      <Store size={14} aria-hidden />
      <span>{seller.businessName || seller.name}{seller.city ? `, ${seller.city}` : ''}</span>
      {seller.ratingCount > 0 && <span className="inline-flex items-center gap-0.5"><Star size={12} aria-hidden className="fill-current" />{Number(seller.ratingAvg).toFixed(1)} ({seller.ratingCount})</span>}
    </p>
  );
}

export default function ProductCard({ product: p, to = `/marketplace/${p._id}`, footer }) {
  return (
    <article className="glass flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-e2">
      <Link to={to} aria-label={`View ${p.title}`}><ProductThumb product={p} className="aspect-[4/3]" /></Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <ProductBadges product={p} />
        <h3 className="text-base font-bold leading-snug text-ink dark:text-white"><Link to={to} className="hover:underline">{p.title}</Link></h3>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{[p.category?.name, p.brand, p.model].filter(Boolean).join(' · ')}</p>
        <SellerLine seller={p.seller} />
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="font-numeric text-lg font-bold text-primary dark:text-primary-tint">{formatMoney(p.price)}</span>
          {p.status && p.status !== 'active' && <Badge tone={PRODUCT_STATUS[p.status]?.[1]}>{PRODUCT_STATUS[p.status]?.[0] || p.status}</Badge>}
        </div>
        {footer}
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="glass overflow-hidden" aria-hidden>
      <Skeleton className="aspect-[4/3] w-full !rounded-none" />
      <div className="space-y-2 p-4"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
    </div>
  );
}
