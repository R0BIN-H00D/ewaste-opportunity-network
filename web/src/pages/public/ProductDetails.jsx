import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Cpu, MessageCircle, Route, ShoppingBag, Wrench } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { ProductBadges, SellerLine } from '../../components/marketplace/ProductCard';
import AboutDevice from '../../components/marketplace/AboutDevice';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { useAuth } from '../../hooks/useAuth';
import { assetUrl } from '../../services/api';
import { marketApi } from '../../services/marketplaceApi';
import { useMarketplaceBase } from '../../hooks/useMarketplaceBase';
import { formatMoney } from '../../lib/requests';
import { friendlyMessage } from '../../utils/errors';

function Gallery({ photos = [], title }) {
  const [at, setAt] = useState(0);
  // On a wide screen the picture grows to the height of the buy card beside it, so the two edges line up.
  if (!photos.length) return <div className="grid aspect-[4/3] place-items-center rounded-[2rem] bg-primary/5 text-sm text-ink-muted lg:aspect-auto lg:min-h-[26rem]" role="img" aria-label="No photo">No photo</div>;
  const main = photos[Math.min(at, photos.length - 1)];
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative flex-1 overflow-hidden rounded-[2rem] bg-white/60 shadow-xl ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10 lg:min-h-[26rem]">
        <img src={assetUrl(main.url)} alt={title} className="aspect-[4/3] w-full object-cover lg:absolute lg:inset-0 lg:aspect-auto lg:h-full" />
      </div>
      {photos.length > 1 && (
        <ul className="flex flex-wrap gap-2.5" aria-label="Product photos">
          {photos.map((p, i) => (
            <li key={p.publicId || p.url}>
              <button type="button" onClick={() => setAt(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === at ? 'true' : undefined} className={`overflow-hidden rounded-2xl ring-2 transition ${i === at ? 'ring-primary dark:ring-primary-tint' : 'opacity-70 ring-transparent hover:opacity-100'}`}>
                <img src={assetUrl(p.url)} alt="" className="h-16 w-20 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EnquiryForm({ product }) {
  const save = useSave();
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (message.trim().length < 5) return setProblem('Write a short question for the seller.');
    setProblem('');
    const res = await save.run(() => marketApi.enquire(product._id, message.trim()), 'Your question was sent');
    if (res.ok) setMessage('');
    return res;
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-3" aria-label="Ask the seller a question">
      <TextField as="textarea" rows={3} label="Ask the seller a question" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} error={problem} />
      <button type="submit" className="btn btn-glass" disabled={save.saving}><MessageCircle size={16} aria-hidden /> {save.saving ? 'Sending…' : 'Send question'}</button>
      <Alert variant="success">{save.status === 'saved' ? 'Your question was sent to the seller. You will get a notification when they reply.' : ''}</Alert>
      <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
    </form>
  );
}

// How an order really goes (the workflow of the app), so a buyer knows what happens after pressing "Order this device".
const BUYING_STEPS = [
  ['Place your order', 'Pay on delivery, pay the seller directly, or pay online.'],
  ['The seller confirms', 'They reserve the device and get it ready for you.'],
  ['Handover', 'You and the seller arrange it. Only the delivery area is shared.'],
  ['You confirm receipt', 'The order is complete, and you can review the seller.'],
];

function HowBuying() {
  return (
    <GlassCard as="section" aria-label="How buying works" className="!rounded-3xl !p-6 sm:!p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-bold text-ink dark:text-white">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary dark:text-primary-tint"><Route size={18} /></span>
          How buying works
        </h2>
        <p className="rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary dark:text-primary-tint sm:text-sm">You can cancel an order until the seller marks it ready.</p>
      </div>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BUYING_STEPS.map(([title, text], i) => (
          <li key={title} className="rounded-2xl bg-black/[0.03] p-4 dark:bg-white/5">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white dark:bg-primary-tint dark:text-canvas-dark">{i + 1}</span>
            <p className="mt-3 text-sm font-semibold text-ink dark:text-white">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted dark:text-[#9FB2A7]">{text}</p>
          </li>
        ))}
      </ol>
    </GlassCard>
  );
}

/** Public product page (FR-MKT-006/007): photos, condition, the Refurbished label, what was done, specs and the seller. */
export default function ProductDetails() {
  const { id } = useParams();
  const location = useLocation();
  const marketBase = useMarketplaceBase();
  const { user, isAuthenticated } = useAuth();
  const { data: p, error, loading, reload } = useFetch((signal) => marketApi.get(id, signal), [id, user?._id]);

  if (loading && !p) return <div className="mx-auto max-w-7xl space-y-5 px-4 py-10" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  if (error && !p) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-10">
        <ErrorState error={missing ? { message: 'This product does not exist or is no longer on sale.' } : error} title={missing ? 'Product not found' : 'Could not load this product'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to={marketBase} className="font-semibold text-primary underline dark:text-primary-tint">Back to the marketplace</Link></p>
      </div>
    );
  }

  const forSale = p.status === 'active' && p.stock > 0;
  const mine = p.isMine;
  const loginTo = { pathname: '/login' };
  const specs = Object.entries(p.specs || {});

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:space-y-8 sm:py-10">
      <Link to={marketBase} className="glass-subtle inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-primary transition hover:-translate-x-0.5 dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Marketplace</Link>

      {/* Row 1: the photo and the buy card, side by side and the same height */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <Gallery photos={p.photos} title={p.title} />

        <div className="glass-strong flex flex-col gap-6 rounded-3xl p-6 sm:p-8">
          <ProductBadges product={p} />
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-ink dark:text-white sm:text-4xl">{p.title}</h1>
            <p className="mt-2 text-sm text-ink-muted dark:text-[#9FB2A7]">{[p.category?.name, p.brand, p.model].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 border-y border-black/5 py-5 dark:border-white/10">
            <p className="font-numeric text-4xl font-extrabold leading-none text-primary dark:text-primary-tint sm:text-5xl">{formatMoney(p.price)}</p>
            {forSale
              ? <span className="rounded-full bg-primary/10 px-3.5 py-1.5 text-sm font-semibold text-primary dark:text-primary-tint">{`${p.stock} in stock`}</span>
              : <Badge tone="neutral">{p.status === 'sold' ? 'Sold' : 'Not on sale'}</Badge>}
          </div>
          <div className="glass-subtle rounded-2xl px-4 py-3.5"><SellerLine seller={p.seller} /></div>

          <div className="mt-auto">
            {mine ? (
              <Alert variant="info">This is your product. <Link to={`/dashboard/products/${p._id}/edit`} className="font-semibold underline">Edit it</Link>.</Alert>
            ) : forSale ? (
              isAuthenticated ? (
                <Link to={`${marketBase}/${p._id}/order`} className="btn btn-primary w-full justify-center !py-4 text-base"><ShoppingBag size={18} aria-hidden /> Order this device</Link>
              ) : (
                <Link to={loginTo} state={{ from: location.pathname }} className="btn btn-primary w-full justify-center !py-4 text-base">Log in to order or ask a question</Link>
              )
            ) : (
              <Alert variant="info">This product is no longer available.</Alert>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: how each part is doing, across the whole page, so its four tiles sit in one tidy row */}
      <AboutDevice product={p} />

      {/* Row 3: what was done beside the specifications, the same height. With no specifications it is one wide callout instead, so no card is left half empty. */}
      <div className={`grid gap-6 lg:items-stretch ${specs.length > 0 ? 'lg:grid-cols-2' : ''}`}>
        <GlassCard as="section" aria-label="What was done" className={`!rounded-3xl !p-6 sm:!p-7 ${specs.length > 0 ? 'space-y-3' : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-7'}`}>
          <h2 className="flex shrink-0 items-center gap-3 text-lg font-bold text-ink dark:text-white">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary dark:text-primary-tint"><Wrench size={18} /></span>
            What was done to it
          </h2>
          <p className={`whitespace-pre-line leading-relaxed text-ink dark:text-[#E8F1EB] ${specs.length > 0 ? 'text-sm' : 'text-base sm:border-l sm:border-black/10 sm:pl-7 dark:sm:border-white/10'}`}>{p.refurbishmentInfo}</p>
        </GlassCard>
        {specs.length > 0 && (
          <GlassCard as="section" aria-label="Specifications" className="!rounded-3xl !p-6 sm:!p-7">
            <h2 className="mb-3 flex items-center gap-3 text-lg font-bold text-ink dark:text-white">
              <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary dark:text-primary-tint"><Cpu size={18} /></span>
              Specifications
            </h2>
            <dl className="divide-y divide-black/5 text-sm dark:divide-white/10">
              {specs.map(([k, v]) => (<div key={k} className="flex items-baseline justify-between gap-4 py-2.5"><dt className="font-semibold text-ink dark:text-white">{k}</dt><dd className="text-right text-ink dark:text-[#E8F1EB]">{v}</dd></div>))}
            </dl>
          </GlassCard>
        )}
      </div>

      {/* Row 4: how an order goes, as a strip across the page */}
      <HowBuying />

      {!mine && forSale && isAuthenticated && <GlassCard as="section" aria-label="Contact the seller"><EnquiryForm product={p} /></GlassCard>}

    </div>
  );
}
