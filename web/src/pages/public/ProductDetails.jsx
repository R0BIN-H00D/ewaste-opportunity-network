import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, ShoppingBag, Wrench } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Modal from '../../components/ui/Modal';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { ProductBadges, SellerLine } from '../../components/marketplace/ProductCard';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { useAuth } from '../../hooks/useAuth';
import { assetUrl } from '../../services/api';
import { marketApi, orderApi } from '../../services/marketplaceApi';
import { PAYMENT_METHODS } from '../../lib/marketplace';
import { formatMoney } from '../../lib/requests';
import { applyFieldErrors, friendlyMessage } from '../../utils/errors';

function Gallery({ photos = [], title }) {
  const [at, setAt] = useState(0);
  if (!photos.length) return <div className="grid aspect-[4/3] place-items-center rounded-3xl bg-primary/5 text-sm text-ink-muted" role="img" aria-label="No photo">No photo</div>;
  const main = photos[Math.min(at, photos.length - 1)];
  return (
    <div className="space-y-2">
      <img src={assetUrl(main.url)} alt={title} className="aspect-[4/3] w-full rounded-3xl object-cover" />
      {photos.length > 1 && (
        <ul className="flex flex-wrap gap-2" aria-label="Product photos">
          {photos.map((p, i) => (
            <li key={p.publicId || p.url}>
              <button type="button" onClick={() => setAt(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === at ? 'true' : undefined} className={`overflow-hidden rounded-xl border-2 ${i === at ? 'border-primary dark:border-primary-tint' : 'border-transparent'}`}>
                <img src={assetUrl(p.url)} alt="" className="h-16 w-20 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderDialog({ product, onClose, onDone }) {
  const save = useSave();
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [deliveryArea, setDeliveryArea] = useState('');
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState('');
  const qty = Number(quantity);

  const submit = async () => {
    if (!Number.isInteger(qty) || qty < 1 || qty > product.stock) return setProblem(product.stock === 1 ? 'Only 1 is available, so the quantity must be 1.' : `Choose a quantity between 1 and ${product.stock}.`);
    setProblem('');
    const body = { productId: product._id, quantity: qty, paymentMethod, ...(deliveryArea.trim() ? { deliveryArea: deliveryArea.trim() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) };
    const res = await save.run(() => orderApi.place(body), 'Order placed');
    if (res.ok) onDone(res.result);
    else applyFieldErrors(res.error, (name, { message }) => { if (name === 'quantity') setProblem(message); }, ['quantity']);
    return res;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Place your order"
      footer={<>
        <button type="button" className="btn btn-glass" onClick={onClose} disabled={save.saving}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Placing…' : 'Place order'}</button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm text-ink dark:text-[#E8F1EB]">{product.title}: {formatMoney(product.price)} each. The seller confirms your order, then you arrange the handover. You pay the seller directly; the platform never handles money.</p>
        <TextField label="Quantity" type="number" inputMode="numeric" min="1" max={product.stock} value={quantity} onChange={(e) => setQuantity(e.target.value)} error={problem} hint={`${product.stock} available`} />
        <p className="text-sm font-semibold text-ink dark:text-white" aria-live="polite">Total: {formatMoney(product.price * (Number.isInteger(qty) && qty > 0 ? qty : 1))}</p>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink dark:text-white">How will you pay?</legend>
          <div className="flex flex-wrap gap-4">
            {PAYMENT_METHODS.map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm text-ink dark:text-white">
                <input type="radio" name="paymentMethod" value={v} checked={paymentMethod === v} onChange={() => setPaymentMethod(v)} className="h-4 w-4 accent-[#1E8449]" />{l}
              </label>
            ))}
          </div>
        </fieldset>
        <TextField label="Your area (optional)" value={deliveryArea} onChange={(e) => setDeliveryArea(e.target.value)} maxLength={150} hint="Area or locality only. Share your exact address with the seller yourself, once they confirm." />
        <TextField as="textarea" rows={2} label="Note for the seller (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        <Alert variant="error">{save.status === 'error' && !problem ? friendlyMessage(save.error) : ''}</Alert>
      </div>
    </Modal>
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

/** Public product page (FR-MKT-006/007): photos, condition, the Refurbished label, what was done, specs and the seller. */
export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { data: p, error, loading, reload } = useFetch((signal) => marketApi.get(id, signal), [id, user?._id]);
  const [ordering, setOrdering] = useState(false);

  if (loading && !p) return <div className="mx-auto max-w-6xl space-y-5 px-4 py-10" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  if (error && !p) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-10">
        <ErrorState error={missing ? { message: 'This product does not exist or is no longer on sale.' } : error} title={missing ? 'Product not found' : 'Could not load this product'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to="/marketplace" className="font-semibold text-primary underline dark:text-primary-tint">Back to the marketplace</Link></p>
      </div>
    );
  }

  const forSale = p.status === 'active' && p.stock > 0;
  const mine = p.isMine;
  const loginTo = { pathname: '/login' };
  const specs = Object.entries(p.specs || {});

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-10">
      <Link to="/marketplace" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Marketplace</Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <Gallery photos={p.photos} title={p.title} />
        <div className="space-y-4">
          <ProductBadges product={p} />
          <h1 className="text-3xl font-extrabold text-ink dark:text-white">{p.title}</h1>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{[p.category?.name, p.brand, p.model].filter(Boolean).join(' · ')}</p>
          <p className="font-numeric text-3xl font-bold text-primary dark:text-primary-tint">{formatMoney(p.price)}</p>
          <p className="text-sm text-ink dark:text-[#E8F1EB]">{forSale ? `${p.stock} in stock` : <Badge tone="neutral">{p.status === 'sold' ? 'Sold' : 'Not on sale'}</Badge>}</p>
          <GlassCard className="!p-4"><SellerLine seller={p.seller} /></GlassCard>

          {mine ? (
            <Alert variant="info">This is your product. <Link to={`/dashboard/products/${p._id}/edit`} className="font-semibold underline">Edit it</Link>.</Alert>
          ) : forSale ? (
            isAuthenticated ? (
              <button type="button" className="btn btn-primary" onClick={() => setOrdering(true)}><ShoppingBag size={16} aria-hidden /> Order this device</button>
            ) : (
              <Link to={loginTo} state={{ from: location.pathname }} className="btn btn-primary">Log in to order or ask a question</Link>
            )
          ) : (
            <Alert variant="info">This product is no longer available.</Alert>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard as="section" aria-label="What was done" className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink dark:text-white"><Wrench size={18} aria-hidden />What was done to it</h2>
          <p className="whitespace-pre-line text-sm text-ink dark:text-[#E8F1EB]">{p.refurbishmentInfo}</p>
        </GlassCard>
        {specs.length > 0 && (
          <GlassCard as="section" aria-label="Specifications">
            <h2 className="mb-2 text-lg font-bold text-ink dark:text-white">Specifications</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {specs.map(([k, v]) => (<div key={k} className="contents"><dt className="font-semibold text-ink dark:text-white">{k}</dt><dd className="text-ink dark:text-[#E8F1EB]">{v}</dd></div>))}
            </dl>
          </GlassCard>
        )}
      </div>

      {!mine && forSale && isAuthenticated && <GlassCard as="section" aria-label="Contact the seller"><EnquiryForm product={p} /></GlassCard>}

      {ordering && <OrderDialog product={p} onClose={() => setOrdering(false)} onDone={(order) => navigate(`/dashboard/orders/${order._id}`, { state: { flash: 'Your order was placed. The seller will confirm it soon.' } })} />}
    </div>
  );
}
