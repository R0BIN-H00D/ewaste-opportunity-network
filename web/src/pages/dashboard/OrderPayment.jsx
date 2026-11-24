import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CreditCard, Landmark, Lock, ShieldCheck, Smartphone } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { useAuth } from '../../hooks/useAuth';
import { assetUrl } from '../../services/api';
import { orderApi } from '../../services/marketplaceApi';
import { openCheckout } from '../../lib/razorpay';
import { formatMoney } from '../../lib/requests';
import { friendlyMessage } from '../../utils/errors';

const WAYS = [
  [CreditCard, 'Debit or credit card'],
  [Smartphone, 'UPI'],
  [Landmark, 'Net banking and wallets'],
];

/**
 * The payment page of an order. The card, UPI or bank details are typed in Razorpay's own secure window, which opens from the
 * button here. They never pass through this app, so we never see or store them.
 */
export default function OrderPayment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const save = useSave();
  const { data: o, error, loading, reload } = useFetch((signal) => orderApi.get(id, signal), [id]);

  if (loading && !o) return <div className="mx-auto max-w-3xl space-y-5" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  if (error && !o) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <ErrorState error={missing ? { message: 'This order does not exist or is not yours.' } : error} title={missing ? 'Order not found' : 'Could not load this order'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to="/dashboard/orders" className="font-semibold text-primary underline dark:text-primary-tint">Back to orders</Link></p>
      </div>
    );
  }

  const orderPage = `/dashboard/orders/${o._id}`;
  const canPay = (o.actions || []).includes('pay');
  const photoUrl = o.product?.photo?.url;

  const pay = async () => {
    const res = await save.run(async () => {
      const session = await orderApi.startPayment(o._id);
      let response;
      try {
        response = await openCheckout(session, { name: user?.name, email: user?.email });
      } catch (err) {
        if (err.cancelled) return null; // the window was closed: nothing changes
        throw err;
      }
      return orderApi.verifyPayment(o._id, response);
    }, 'Payment received');
    if (res.ok && res.result) navigate(orderPage, { state: { flash: 'Payment received. The seller will confirm your order soon.' } });
    return res;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to={orderPage} className="glass-subtle inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Back to the order</Link>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink dark:text-white">Pay online</h1>
        <p className="mt-1 text-ink-muted dark:text-[#9FB2A7]">One last step to confirm your order.</p>
      </div>

      <GlassCard as="section" aria-label="Payment summary" className="space-y-5 !rounded-3xl !p-6 sm:!p-8">
        <div className="flex items-center gap-4">
          {photoUrl && <img src={assetUrl(photoUrl)} alt="" className="h-20 w-24 shrink-0 rounded-2xl object-cover" />}
          <div className="min-w-0">
            <p className="font-bold text-ink dark:text-white">{o.product?.title}</p>
            <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{`Quantity ${o.quantity} · ${formatMoney(o.priceAtOrder)} each`}</p>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4 border-t border-black/5 pt-5 dark:border-white/10">
          <span className="font-semibold text-ink dark:text-white">Amount to pay</span>
          <span className="font-numeric text-4xl font-extrabold leading-none text-primary dark:text-primary-tint">{formatMoney(o.total)}</span>
        </div>
      </GlassCard>

      {canPay ? (
        <GlassCard as="section" aria-label="Payment details" className="space-y-5 !rounded-3xl !p-6 sm:!p-8">
          <div>
            <h2 className="text-lg font-bold text-ink dark:text-white">Enter your payment details</h2>
            <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">Press the button below. A secure payment window opens where you choose how to pay and type your details.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3" aria-label="Ways to pay">
            {WAYS.map(([icon, label]) => {
              const Icon = icon;
              return (
                <li key={label} className="glass-subtle flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-ink dark:text-white">
                  <Icon size={18} aria-hidden className="shrink-0 text-primary dark:text-primary-tint" /> {label}
                </li>
              );
            })}
          </ul>
          <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
          <button type="button" className="btn btn-primary w-full justify-center !py-4 text-base" disabled={save.saving} onClick={pay}>
            <Lock size={18} aria-hidden /> {save.saving ? 'Opening payment…' : `Pay ${formatMoney(o.total)} securely`}
          </button>
          <p className="flex items-start gap-2 text-xs text-ink-muted dark:text-[#9FB2A7]">
            <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0" />
            Your card, UPI or bank details go straight to Razorpay, the payment provider. This app never sees or stores them.
          </p>
        </GlassCard>
      ) : (
        <Alert variant="info">This order does not need a payment right now. <Link to={orderPage} className="font-semibold underline">Open the order</Link>.</Alert>
      )}
    </div>
  );
}
