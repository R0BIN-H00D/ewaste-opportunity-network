import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Plus, Store } from 'lucide-react';
import Alert from '../../components/ui/Alert';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import ProductCard, { ProductCardSkeleton } from '../../components/marketplace/ProductCard';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { marketApi } from '../../services/marketplaceApi';
import { friendlyMessage } from '../../utils/errors';

const TABS = [['', 'All'], ['active', 'On sale'], ['hidden', 'Hidden'], ['sold', 'Sold']];

/** A refurbisher's own products (FR-MKT-004): edit, hide or show, remove. */
export default function MyProducts() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => marketApi.mine({ status, page, limit: 12 }, signal), [status, page]);
  const save = useSave();
  const [removing, setRemoving] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash || '');
  const items = data?.items || [];

  const toggle = async (p) => {
    const form = new FormData();
    form.append('status', p.status === 'hidden' ? 'active' : 'hidden');
    const res = await save.run(() => marketApi.update(p._id, form), p.status === 'hidden' ? 'Product is on sale again' : 'Product hidden');
    if (res.ok) { setFlash(p.status === 'hidden' ? 'The product is on sale again.' : 'The product is hidden from the marketplace.'); reload(); }
  };
  const remove = async () => {
    const res = await save.run(() => marketApi.remove(removing._id), 'Product removed');
    if (res.ok) { setRemoving(null); setFlash('The product was removed.'); reload(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">My products</h1>
        <Link to="/dashboard/products/new" className="btn btn-primary"><Plus size={16} aria-hidden /> List a product</Link>
      </div>
      <Alert variant="success">{flash}</Alert>
      <Alert variant="error">{save.status === 'error' && !removing ? friendlyMessage(save.error) : ''}</Alert>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Show products">
        {TABS.map(([value, label]) => (
          <button key={value || 'all'} type="button" role="tab" aria-selected={status === value} onClick={() => setParams(value ? { status: value } : {})}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${status === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted hover:text-ink dark:hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load your products" />
      ) : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>{[0, 1, 2].map((i) => <ProductCardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Store} title={status ? 'No products here' : 'You have no products yet'} action={<Link to="/dashboard/refurbishment" className="btn btn-primary">Go to my refurbishment jobs</Link>}>
          Finish a refurbishment job and list it from there, or add a product yourself.
        </EmptyState>
      ) : (
        <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
          {items.map((p) => (
            <ProductCard
              key={p._id}
              product={p}
              footer={
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link to={`/dashboard/products/${p._id}/edit`} className="btn btn-glass" aria-label={`Edit ${p.title}`}>Edit</Link>
                  {p.status !== 'sold' && <button type="button" className="btn btn-glass" disabled={save.saving} onClick={() => toggle(p)} aria-label={`${p.status === 'hidden' ? 'Show' : 'Hide'} ${p.title}`}>{p.status === 'hidden' ? 'Show' : 'Hide'}</button>}
                  <button type="button" className="btn btn-glass" disabled={save.saving} onClick={() => { save.reset(); setRemoving(p); }} aria-label={`Remove ${p.title}`}>Remove</button>
                </div>
              }
            />
          ))}
        </div>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...(status ? { status } : {}), ...(n > 1 ? { page: String(n) } : {}) })} />}

      <ConfirmDialog open={Boolean(removing)} title="Remove this product?" confirmLabel="Remove product" busy={save.saving} onConfirm={remove} onCancel={() => { setRemoving(null); save.reset(); }}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">{removing?.title} will no longer be shown. You cannot remove a product while it has open orders.</p>
        <Alert variant="error" className="mt-3">{save.status === 'error' && removing ? friendlyMessage(save.error) : ''}</Alert>
      </ConfirmDialog>
    </div>
  );
}
