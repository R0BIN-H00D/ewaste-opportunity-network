import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, Handshake, Hash, MapPin, Minus, Plus, StickyNote, Wallet } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import DetectLocationButton from '../../components/ui/DetectLocationButton';
import { ProductBadges, SellerLine } from '../../components/marketplace/ProductCard';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { useAuth } from '../../hooks/useAuth';
import { useMarketplaceBase } from '../../hooks/useMarketplaceBase';
import { assetUrl } from '../../services/api';
import { marketApi, orderApi } from '../../services/marketplaceApi';
import { PAYMENT_CHOICES, validateDelivery } from '../../lib/marketplace';
import { formatMoney } from '../../lib/requests';
import { applyFieldErrors, friendlyMessage } from '../../utils/errors';

const PAY_ICONS = { cod: Banknote, offline: Handshake, online: CreditCard };

/** One numbered step of the order form. */
function Step({ number, icon, title, hint, children }) {
  const Icon = icon;
  return (
    <GlassCard as="section" aria-label={title} className="space-y-5 !rounded-3xl !p-6 sm:!p-7">
      <div className="flex items-start gap-4">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-bold text-white dark:bg-primary-tint dark:text-canvas-dark">{number}</span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink dark:text-white"><Icon size={18} aria-hidden className="text-primary dark:text-primary-tint" /> {title}</h2>
          {hint && <p className="mt-0.5 text-sm text-ink-muted dark:text-[#9FB2A7]">{hint}</p>}
        </div>
      </div>
      {children}
    </GlassCard>
  );
}

/**
 * Place an order: its own page, in steps (how many, how to pay, where to deliver, a note), with a summary that stays in
 * view beside it. The same rules as the server, so people are told straight away what to fix.
 */
export default function PlaceOrder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const marketBase = useMarketplaceBase();
  const { user } = useAuth();
  const { data: p, error, loading, reload } = useFetch((signal) => marketApi.get(id, signal), [id, user?._id]);
  const save = useSave();
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [place, setPlace] = useState({ deliveryArea: '', deliveryCity: '', deliveryPincode: '' });
  const [placeErrors, setPlaceErrors] = useState({});
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState('');

  if (loading && !p) return <div className="mx-auto max-w-7xl space-y-5 px-4 py-10" aria-busy><Skeleton className="h-10 w-1/3" /><Skeleton className="h-72 w-full !rounded-3xl" /></div>;
  if (error && !p) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-10">
        <ErrorState error={missing ? { message: 'This product does not exist or is no longer on sale.' } : error} title={missing ? 'Product not found' : 'Could not load this product'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to={marketBase} className="font-semibold text-primary underline dark:text-primary-tint">Back to the marketplace</Link></p>
      </div>
    );
  }

  const productPage = `${marketBase}/${p._id}`;
  const forSale = p.status === 'active' && p.stock > 0;
  const blocked = p.isMine ? 'This is your own product, so you cannot order it.' : !forSale ? 'This product is no longer available.' : '';
  const qty = Number(quantity);
  const validQty = Number.isInteger(qty) && qty >= 1 && qty <= p.stock;
  const shownQty = validQty ? qty : 1;
  const photo = p.photos?.[0];

  const setPlaceField = (name) => (e) => {
    setPlace((v) => ({ ...v, [name]: e.target.value }));
    setPlaceErrors((er) => ({ ...er, [name]: undefined }));
  };
  // The detected address fills the three fields (the pincode only when it is a valid 6-digit one) and clears their errors.
  const fillFromLocation = (found) => {
    const pin = /^[1-9][0-9]{5}$/.test(found.postcode || '') ? found.postcode : '';
    setPlace((v) => ({ deliveryArea: found.area || v.deliveryArea, deliveryCity: found.city || v.deliveryCity, deliveryPincode: pin || v.deliveryPincode }));
    setPlaceErrors({});
  };
  const stepQty = (delta) => {
    setProblem('');
    setQuantity(String(Math.min(p.stock, Math.max(1, (Number.isInteger(qty) ? qty : 1) + delta))));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validQty) return setProblem(p.stock === 1 ? 'Only 1 is available, so the quantity must be 1.' : `Choose a quantity between 1 and ${p.stock}.`);
    const found = validateDelivery(place);
    setPlaceErrors(found);
    if (Object.keys(found).length) return setProblem('');
    setProblem('');
    const body = { productId: p._id, quantity: qty, paymentMethod, deliveryArea: place.deliveryArea.trim(), deliveryCity: place.deliveryCity.trim(), deliveryPincode: place.deliveryPincode.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}) };
    const res = await save.run(() => orderApi.place(body), 'Order placed');
    if (res.ok && paymentMethod === 'online') navigate(`/dashboard/orders/${res.result._id}/pay`);
    else if (res.ok) navigate(`/dashboard/orders/${res.result._id}`, { state: { flash: 'Your order was placed. The seller will confirm it soon.' } });
    else applyFieldErrors(res.error, (name, { message }) => {
      if (name === 'quantity') setProblem(message);
      else setPlaceErrors((er) => ({ ...er, [name]: message }));
    }, ['quantity', 'deliveryArea', 'deliveryCity', 'deliveryPincode']);
    return res;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:space-y-8 sm:py-10">
      <Link to={productPage} className="glass-subtle inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-primary transition hover:-translate-x-0.5 dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Back to the product</Link>

      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink dark:text-white sm:text-4xl">Place your order</h1>
        <p className="mt-2 max-w-2xl text-ink-muted dark:text-[#9FB2A7]">Tell us how many you want, how you will pay and where it should go. The seller confirms your order, then you arrange the handover.</p>
      </header>

      {blocked ? (
        <Alert variant="info">{blocked} <Link to={productPage} className="font-semibold underline">Back to the product</Link>.</Alert>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8">
          <form id="order-form" onSubmit={submit} noValidate className="space-y-6" aria-label="Order details">
            <Step number={1} icon={Hash} title="How many do you want?" hint={`${p.stock} available`}>
              <div>
                <div className="flex items-center gap-3">
                  <button type="button" className="btn btn-glass !h-12 !w-12 !p-0" aria-label="Decrease quantity" onClick={() => stepQty(-1)} disabled={qty <= 1}><Minus size={18} aria-hidden /></button>
                  <TextField label="Quantity" type="number" inputMode="numeric" min="1" max={p.stock} value={quantity} onChange={(e) => { setQuantity(e.target.value); setProblem(''); }} className="w-28 [&_label]:sr-only [&_input]:text-center [&_input]:text-lg [&_input]:font-bold" />
                  <button type="button" className="btn btn-glass !h-12 !w-12 !p-0" aria-label="Increase quantity" onClick={() => stepQty(1)} disabled={qty >= p.stock}><Plus size={18} aria-hidden /></button>
                </div>
                {problem && <p role="alert" className="mt-2 text-sm font-medium text-danger dark:text-red-300">{problem}</p>}
              </div>
            </Step>

            <Step number={2} icon={Wallet} title="How will you pay?" hint="You choose now. Nothing is charged by this page.">
              <fieldset>
                <legend className="sr-only">How will you pay?</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {PAYMENT_CHOICES.map(([value, label, text]) => {
                    const Icon = PAY_ICONS[value];
                    const on = paymentMethod === value;
                    return (
                      <label key={value} className={`relative flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-4 transition ${on ? 'border-primary bg-primary/5 dark:border-primary-tint' : 'border-black/10 hover:border-primary/40 dark:border-white/10'}`}>
                        <input type="radio" name="paymentMethod" value={value} checked={on} onChange={() => setPaymentMethod(value)} aria-label={label} className="sr-only" />
                        <span className="flex items-center justify-between">
                          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-white/80 text-primary shadow-sm dark:bg-white/10 dark:text-primary-tint"><Icon size={18} /></span>
                          {on && <CheckCircle2 size={20} aria-hidden className="text-primary dark:text-primary-tint" />}
                        </span>
                        <span aria-hidden className="text-sm font-bold text-ink dark:text-white">{label}</span>
                        <span aria-hidden className="text-xs leading-relaxed text-ink-muted dark:text-[#9FB2A7]">{text}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </Step>

            <Step number={3} icon={MapPin} title="Where should it be delivered?" hint="Area only. Share your exact address with the seller yourself, once they confirm.">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetectLocationButton className="sm:col-span-2" onDetected={fillFromLocation} />
                <TextField className="sm:col-span-2" label="Area or locality" value={place.deliveryArea} onChange={setPlaceField('deliveryArea')} error={placeErrors.deliveryArea} maxLength={150} autoComplete="address-level3" />
                <TextField label="City" value={place.deliveryCity} onChange={setPlaceField('deliveryCity')} error={placeErrors.deliveryCity} maxLength={80} autoComplete="address-level2" />
                <TextField label="Pincode" inputMode="numeric" value={place.deliveryPincode} onChange={setPlaceField('deliveryPincode')} error={placeErrors.deliveryPincode} maxLength={6} autoComplete="postal-code" />
              </div>
            </Step>

            <Step number={4} icon={StickyNote} title="A note for the seller" hint="Optional. For example a good time to call.">
              <TextField as="textarea" rows={3} label="Note for the seller (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="[&_label]:sr-only" />
            </Step>
          </form>

          <aside aria-label="Order summary" className="space-y-4 lg:sticky lg:top-24">
            <GlassCard className="space-y-5 !rounded-3xl !p-6 sm:!p-7">
              <h2 className="text-lg font-bold text-ink dark:text-white">Order summary</h2>
              <div className="flex gap-4">
                {photo
                  ? <img src={assetUrl(photo.url)} alt={p.title} className="h-24 w-28 shrink-0 rounded-2xl object-cover ring-1 ring-black/5 dark:ring-white/10" />
                  : <div className="h-24 w-28 shrink-0 rounded-2xl bg-primary/5" aria-hidden />}
                <div className="min-w-0 space-y-1.5">
                  <p className="font-bold leading-snug text-ink dark:text-white">{p.title}</p>
                  <ProductBadges product={p} />
                  <SellerLine seller={p.seller} />
                </div>
              </div>
              <dl className="space-y-2.5 border-t border-black/5 pt-4 text-sm dark:border-white/10">
                <div className="flex justify-between gap-4"><dt className="text-ink-muted dark:text-[#9FB2A7]">Price each</dt><dd className="font-semibold text-ink dark:text-white">{formatMoney(p.price)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted dark:text-[#9FB2A7]">Quantity</dt><dd className="font-semibold text-ink dark:text-white">{shownQty}</dd></div>
                <div className="flex items-end justify-between gap-4 border-t border-black/5 pt-3 dark:border-white/10" aria-live="polite">
                  <dt className="font-semibold text-ink dark:text-white">Total</dt>
                  <dd className="font-numeric text-3xl font-extrabold leading-none text-primary dark:text-primary-tint">{formatMoney(p.price * shownQty)}</dd>
                </div>
              </dl>
              <Alert variant="error">{save.status === 'error' && !problem ? friendlyMessage(save.error) : ''}</Alert>
              {save.status === 'error' && save.error?.code === 'ALREADY_ORDERED' && (
                <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Finish, pay for or cancel that order first. <Link to="/dashboard/orders" className="font-semibold text-primary underline dark:text-primary-tint">Open my orders</Link></p>
              )}
              <button type="submit" form="order-form" className="btn btn-primary w-full justify-center !py-4 text-base" disabled={save.saving}>{save.saving ? 'Placing…' : 'Place order'}</button>
              <Link to={productPage} className="btn btn-glass w-full justify-center">Cancel</Link>
            </GlassCard>

            <ul className="space-y-2.5 px-2 text-sm text-ink dark:text-[#E8F1EB]">
              {['The seller confirms your order before anything is final.', 'You can cancel until the seller marks it ready.', 'Only your delivery area is shared, never your exact address.'].map((t) => (
                <li key={t} className="flex items-start gap-2.5"><CheckCircle2 size={17} aria-hidden className="mt-0.5 shrink-0 text-primary dark:text-primary-tint" />{t}</li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
