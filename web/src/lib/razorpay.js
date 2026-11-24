// Razorpay Checkout (TEST mode demo). The script is loaded only when someone pays, from Razorpay's own address.
const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading;

export function loadCheckout() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SRC;
      el.async = true;
      el.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Payment window did not load')));
      el.onerror = () => { loading = undefined; el.remove(); reject(new Error('Could not load the payment window. Check your internet connection and try again.')); };
      document.head.appendChild(el);
    });
  }
  return loading;
}

/**
 * Opens the payment window for a session from `POST /orders/:id/payment`.
 * Resolves with { razorpay_order_id, razorpay_payment_id, razorpay_signature }, or rejects with `cancelled: true` when closed.
 */
export async function openCheckout(session, { name, email } = {}) {
  const Razorpay = await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: session.keyId,
      order_id: session.gatewayOrderId,
      amount: session.amount,
      currency: session.currency,
      name: 'E-Waste Network (demo)',
      description: session.description,
      prefill: { ...(name ? { name } : {}), ...(email ? { email } : {}) },
      theme: { color: '#1E8449' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(Object.assign(new Error('Payment window closed'), { cancelled: true })) },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'The payment failed. You can try again.')));
    rzp.open();
  });
}
