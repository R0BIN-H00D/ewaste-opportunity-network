import { Link, useSearchParams } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../hooks/useAuth';
import { orderApi } from '../../services/marketplaceApi';
import { orderLabel, orderTone } from '../../lib/marketplace';
import { formatDate, formatMoney } from '../../lib/requests';
import { assetUrl } from '../../services/api';

const TABS = [['seller', 'Orders received'], ['buyer', 'My purchases']];

function OrderCard({ order: o }) {
  const seller = o.viewerRole === 'seller';
  return (
    <GlassCard as="article" className="flex gap-4 !p-4">
      <Link to={`/dashboard/orders/${o._id}`} aria-label={`View order for ${o.product?.title}`} className="shrink-0">
        {o.product?.photo ? <img src={assetUrl(o.product.photo.url)} alt="" className="h-20 w-24 rounded-2xl object-cover" /> : <div className="h-20 w-24 rounded-2xl bg-primary/5" aria-hidden />}
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-bold text-ink dark:text-white"><Link to={`/dashboard/orders/${o._id}`} className="hover:underline">{o.product?.title}</Link></h2>
          <Badge tone={orderTone(o.status)}>{orderLabel(o.status)}</Badge>
        </div>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
          {seller ? `Buyer ${o.buyer?.name || ''}` : `Seller ${o.seller?.businessName || o.seller?.name || ''}`} · {o.quantity} × {formatMoney(o.priceAtOrder)} = {formatMoney(o.total)} · {formatDate(o.updatedAt || o.createdAt)}
        </p>
      </div>
    </GlassCard>
  );
}

/** Orders. Refurbishers see the orders they received and their own purchases; everyone else sees their purchases. */
export default function Orders() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isSeller = user?.role === 'refurbisher';
  const as = !isSeller || params.get('as') === 'buyer' ? 'buyer' : 'seller';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => orderApi.list({ as, page, limit: 10 }, signal), [as, page]);
  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Orders</h1>
        <Link to="/marketplace" className="btn btn-glass">Browse the marketplace</Link>
      </div>

      {isSeller && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Which orders">
          {TABS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={as === value} onClick={() => setParams(value === 'seller' ? {} : { as: value })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${as === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted hover:text-ink dark:hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load your orders" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        as === 'seller' ? (
          <EmptyState icon={ShoppingBag} art="devices" title="No orders yet" action={<Link to="/dashboard/products" className="btn btn-primary">See my products</Link>}>Orders from buyers appear here as soon as someone orders one of your products.</EmptyState>
        ) : (
          <EmptyState icon={ShoppingBag} art="devices" title="You have not ordered anything yet" action={<Link to="/marketplace" className="btn btn-primary">Browse refurbished devices</Link>}>Orders you place on the marketplace appear here.</EmptyState>
        )
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((o) => <li key={o._id}><OrderCard order={o} /></li>)}</ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...(as === 'buyer' && isSeller ? { as } : {}), ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}
