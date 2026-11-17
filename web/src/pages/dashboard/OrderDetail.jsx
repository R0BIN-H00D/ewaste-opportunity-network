import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Check, MapPin, Star, User, XCircle } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import MessageButton from '../../components/chat/MessageButton';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import ReviewDialog from '../../components/requests/ReviewDialog';
import { ProductBadges } from '../../components/marketplace/ProductCard';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { assetUrl } from '../../services/api';
import { orderApi } from '../../services/marketplaceApi';
import { reviewApi } from '../../services/repairApi';
import { ORDER_ACTIONS, PAYMENT_METHODS, orderLabel, orderSteps, orderTone } from '../../lib/marketplace';
import { labelOf } from '../../lib/devices';
import { formatDate, formatMoney } from '../../lib/requests';
import { friendlyMessage } from '../../utils/errors';

function Tracker({ order }) {
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-3" aria-label="Order progress">
      {orderSteps(order).map((s, i) => (
        <li key={s.key} className="flex items-center gap-2" aria-current={s.state === 'current' ? 'step' : undefined}>
          <span aria-hidden className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${s.state === 'done' ? 'bg-success text-white' : s.state === 'current' ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted'}`}>
            {s.state === 'done' ? <Check size={14} /> : i + 1}
          </span>
          <span className={`text-sm ${s.state === 'todo' ? 'text-ink-muted dark:text-[#9FB2A7]' : 'font-semibold text-ink dark:text-white'}`}>
            {s.label}
            <span className="sr-only">{s.state === 'done' ? ' (done)' : s.state === 'current' ? ' (current step)' : ' (not yet)'}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** What the viewer can do next. The server decides (`order.actions`); this only draws the matching buttons. */
function OrderActions({ order: o, onChanged }) {
  const save = useSave();
  const [dialog, setDialog] = useState('');
  const [reason, setReason] = useState('');
  const has = (a) => (o.actions || []).includes(a);
  const busy = save.saving;
  const close = () => { setDialog(''); setReason(''); save.reset(); };
  const run = async (action, message) => {
    const res = await save.run(action, message);
    if (res.ok) { onChanged(res.result, message); setDialog(''); setReason(''); }
    return res;
  };

  const steps = Object.entries(ORDER_ACTIONS).filter(([a]) => has(a));
  const buyer = o.viewerRole === 'buyer';
  const note = {
    confirm: 'Confirming takes the item out of your stock and tells the buyer.',
    complete: 'Confirming records the order as complete and the payment you made to the seller. Pay the seller directly.',
  };

  if (steps.length === 0 && !has('cancel') && !o.canReview && save.status !== 'error') return null;
  return (
    <GlassCard as="section" aria-label="What you can do now" className="space-y-4">
      <h2 className="text-lg font-bold text-ink dark:text-white">What to do next</h2>
      <Alert variant="error">{save.status === 'error' && !dialog ? friendlyMessage(save.error) : ''}</Alert>
      {steps.map(([action, [status, label]]) => (
        <div key={action} className="space-y-2">
          {note[action] && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{note[action]}</p>}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => orderApi.setStatus(o._id, status), `Order ${orderLabel(status).toLowerCase()}`)}>{label}</button>
        </div>
      ))}
      {o.canReview && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Your review helps other people choose a refurbisher.</p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { save.reset(); setDialog('review'); }}><Star size={16} aria-hidden /> Review the seller</button>
        </div>
      )}
      {has('cancel') && <button type="button" className="btn btn-glass" disabled={busy} onClick={() => { save.reset(); setDialog('cancel'); }}><XCircle size={16} aria-hidden /> Cancel this order</button>}

      <ConfirmDialog open={dialog === 'cancel'} title="Cancel this order?" confirmLabel="Cancel order" busy={busy} onConfirm={() => run(() => orderApi.cancel(o._id, reason.trim()), 'Order cancelled')} onCancel={close}>
        <p className="mb-3 text-sm text-ink dark:text-[#E8F1EB]">{buyer ? 'The seller will be told.' : 'The buyer will be told.'}</p>
        <TextField as="textarea" rows={2} label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <Alert variant="error" className="mt-3">{save.status === 'error' && dialog === 'cancel' ? friendlyMessage(save.error) : ''}</Alert>
      </ConfirmDialog>
      <ReviewDialog
        open={dialog === 'review'}
        providerName={o.seller?.businessName || o.seller?.name}
        busy={busy}
        error={save.status === 'error' && dialog === 'review' ? friendlyMessage(save.error) : ''}
        onCancel={close}
        onSubmit={(values) => run(async () => { await reviewApi.create({ contextType: 'order', contextId: o._id, ...values }); return orderApi.get(o._id); }, 'Thank you for your review')}
      />
    </GlassCard>
  );
}

/** One page for both sides of an order. */
export default function OrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data, error, loading, reload } = useFetch((signal) => orderApi.get(id, signal), [id]);
  const [fresh, setFresh] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash || '');
  const o = fresh?._id === id ? fresh : data;

  if (loading && !o) return <div className="space-y-5" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-48 w-full !rounded-3xl" /></div>;
  if (error && !o) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="space-y-5">
        <ErrorState error={missing ? { message: 'This order does not exist or is not yours.' } : error} title={missing ? 'Order not found' : 'Could not load this order'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to="/dashboard/orders" className="font-semibold text-primary underline dark:text-primary-tint">Back to orders</Link></p>
      </div>
    );
  }

  const seller = o.viewerRole === 'seller';
  return (
    <div className="space-y-5">
      <Link to="/dashboard/orders" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Orders</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Order for {o.product?.title}</h1>
        <Badge tone={orderTone(o.status)}>{orderLabel(o.status)}</Badge>
      </div>
      <Alert variant="success">{flash}</Alert>
      <GlassCard><Tracker order={o} /></GlassCard>
      <OrderActions order={o} onChanged={(updated, message) => { setFresh(updated); setFlash(message || ''); }} />
      <div><MessageButton contextType="order" contextId={o._id} label={`Message ${(seller ? o.buyer?.name : o.seller?.name) || (seller ? 'the buyer' : 'the seller')}`} /></div>
      {seller && o.status === 'delivered' && <Alert variant="info">Waiting for the buyer to confirm they received it. That completes the order and records the payment.</Alert>}

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard as="section" aria-label="Product and payment" className="space-y-4">
          <div className="flex gap-4">
            {o.product?.photo ? <img src={assetUrl(o.product.photo.url)} alt={o.product.title} className="h-24 w-32 shrink-0 rounded-2xl object-cover" /> : <div className="h-24 w-32 shrink-0 rounded-2xl bg-primary/5" aria-hidden />}
            <div className="min-w-0 space-y-1">
              <p className="font-bold text-ink dark:text-white"><Link to={`/marketplace/${o.product?._id}`} className="hover:underline">{o.product?.title}</Link></p>
              {o.product?.condition && <ProductBadges product={o.product} />}
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-ink dark:text-[#E8F1EB]">
            <dt className="font-semibold">Price</dt><dd>{o.quantity} × {formatMoney(o.priceAtOrder)}</dd>
            <dt className="font-semibold">Total</dt><dd className="font-numeric font-bold">{formatMoney(o.total)}</dd>
            <dt className="font-semibold">Payment</dt><dd>{labelOf(PAYMENT_METHODS, o.paymentMethod)}{o.paymentStatus === 'unpaid' ? ' (not paid yet)' : o.paymentStatus === 'paid_offline' ? ' (paid, recorded)' : ' (payment confirmed)'}</dd>
          </dl>
          <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Paid directly between the two people. The platform only keeps a record.</p>
          <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]"><User size={16} aria-hidden />{seller ? `Buyer: ${o.buyer?.name}` : `Seller: ${o.seller?.businessName || o.seller?.name}`}</p>
          {o.deliveryArea && <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]"><MapPin size={16} aria-hidden /><span className="font-semibold">Delivery area:</span> <span>{o.deliveryArea}</span></p>}
          {o.notes && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Note: “{o.notes}”</p>}
          {o.status === 'cancelled' && o.cancelReason && <Alert variant="info">Cancelled: {o.cancelReason}</Alert>}
          {o.reviewed && !seller && <Alert variant="success">You reviewed this seller. Thank you.</Alert>}
        </GlassCard>

        <GlassCard as="section" aria-label="Activity">
          <h2 className="mb-3 text-lg font-bold text-ink dark:text-white">Activity</h2>
          <ol className="space-y-3" aria-label="History">
            {[...(o.history || [])].reverse().map((h, i) => (
              <li key={`${h.status}-${h.at}-${i}`} className="border-l-2 border-primary/30 pl-3 text-sm">
                <p className="font-semibold text-ink dark:text-white">{orderLabel(h.status)}</p>
                <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(h.at)}</p>
                {h.note && <p className="mt-1 text-ink dark:text-[#E8F1EB]">{h.note}</p>}
              </li>
            ))}
          </ol>
        </GlassCard>
      </div>
    </div>
  );
}
