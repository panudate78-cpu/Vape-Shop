'use client';
import { useId, useState } from 'react';
import { gbp } from '@/lib/format';

type TrackedOrder = {
  order: {
    id: number; status: string; paymentStatus: string; fulfilmentStatus: string | null;
    collectionMode: string | null; totalAmount: string | null; shippingCost: string | null;
    discount: string | null; trackingNumber: string | null; createdAt: string | null;
  };
  items: { productName: string; variantLabel: string | null; quantity: number; unitPrice: string | null }[];
};

// Customer-facing wording for each stored status.
function customerStatus(o: TrackedOrder['order']): { headline: string; detail: string } {
  if (o.paymentStatus === 'pending') return { headline: 'Payment not yet received', detail: 'Your payment has not gone through, so nothing has been dispatched.' };
  if (o.paymentStatus === 'failed') return { headline: 'Payment failed', detail: 'Your payment did not go through. Please place the order again or call us.' };
  if (o.status === 'cancelled') return { headline: 'Order cancelled', detail: 'This order has been cancelled. If you were charged, we will refund you.' };
  if (o.paymentStatus === 'refunded') return { headline: 'Refunded', detail: 'This order has been refunded in full.' };
  if (o.paymentStatus === 'partially_refunded') return { headline: 'Partly refunded', detail: 'Part of this order has been refunded.' };
  switch (o.fulfilmentStatus || 'unfulfilled') {
    case 'collected': return { headline: 'Collected', detail: 'Thanks for collecting your order.' };
    case 'shipped': return { headline: 'On its way', detail: o.trackingNumber ? 'Your order has been dispatched. Use the tracking number below.' : 'Your order has been dispatched.' };
    case 'ready': return { headline: 'Ready to collect', detail: 'Bring photo ID and your order number to the shop.' };
    case 'processing': return { headline: 'Being prepared', detail: 'We are packing your order.' };
    default: return { headline: 'Order received', detail: o.collectionMode === 'collect' ? 'We will let you know when it is ready to collect.' : 'We will let you know when it has been dispatched.' };
  }
}

export default function TrackPage() {
  const uid = useId();
  const [id, setId] = useState('');
  const [email, setEmail] = useState('');
  const [data, setData] = useState<TrackedOrder | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!/^\d+$/.test(id.trim())) fe.id = 'Enter the order number from your confirmation email, such as 1042.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) fe.email = 'Enter the email address you used at checkout.';
    setFieldErr(fe);
    if (Object.keys(fe).length) {
      document.getElementById(Object.keys(fe)[0] === 'id' ? `${uid}-id` : `${uid}-email`)?.focus();
      return;
    }
    setLoading(true); setErr(null); setData(null);
    try {
      const r = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: Number(id.trim()), email: email.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'We could not find an order with that number and email.'); return; }
      setData(d as TrackedOrder);
    } catch {
      setErr('We could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const input = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#64B5F6]';
  const status = data ? customerStatus(data.order) : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-black text-slate-900">Track your order</h1>
      <p className="text-slate-700 text-sm mt-1">Enter the order number from your confirmation email and the email address you used at checkout.</p>

      <form onSubmit={go} noValidate className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <label htmlFor={`${uid}-id`} className="block text-sm font-bold text-slate-800">Order number</label>
          <input id={`${uid}-id`} inputMode="numeric" className={input} value={id} onChange={(e) => setId(e.target.value)} aria-invalid={!!fieldErr.id} aria-describedby={fieldErr.id ? `${uid}-id-err` : undefined} />
          {fieldErr.id && <p id={`${uid}-id-err`} className="mt-1 text-sm font-semibold text-red-800">{fieldErr.id}</p>}
        </div>
        <div>
          <label htmlFor={`${uid}-email`} className="block text-sm font-bold text-slate-800">Email address</label>
          <input id={`${uid}-email`} type="email" autoComplete="email" inputMode="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} aria-describedby={fieldErr.email ? `${uid}-email-err` : undefined} />
          {fieldErr.email && <p id={`${uid}-email-err`} className="mt-1 text-sm font-semibold text-red-800">{fieldErr.email}</p>}
        </div>
        <button disabled={loading} className="w-full rounded-xl bg-[#1976D2] hover:bg-[#1565C0] text-white font-extrabold py-2.5 disabled:bg-slate-300 disabled:text-slate-700">
          {loading ? 'Looking up your order…' : 'Track order'}
        </button>
        {err && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">{err}</p>}
      </form>

      {data && status && (
        <section aria-labelledby={`${uid}-result`} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5" aria-live="polite">
          <h2 id={`${uid}-result`} className="font-black text-slate-900">Order #{data.order.id}</h2>
          <p className="mt-2 text-lg font-extrabold text-slate-900">{status.headline}</p>
          <p className="text-sm text-slate-700">{status.detail}</p>
          {data.order.trackingNumber && <p className="mt-2 text-sm text-slate-900">Tracking number: <span className="font-mono font-bold">{data.order.trackingNumber}</span></p>}
          <ul className="divide-y divide-slate-200 mt-4 text-sm">
            {data.items.map((i, n) => (
              <li key={n} className="py-2 flex justify-between gap-2">
                <span className="text-slate-900">{i.productName}{i.variantLabel ? ` (${i.variantLabel})` : ''} × {i.quantity}</span>
                <span className="font-semibold text-slate-900">{gbp(Number(i.unitPrice ?? 0) * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="border-t border-slate-200 mt-3 pt-3 text-sm space-y-1">
            {Number(data.order.discount) > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{gbp(Number(data.order.discount))}</dd></div>}
            <div className="flex justify-between"><dt>{data.order.collectionMode === 'collect' ? 'Collection' : 'Delivery'}</dt><dd>{Number(data.order.shippingCost) === 0 ? 'Free' : gbp(Number(data.order.shippingCost))}</dd></div>
            <div className="flex justify-between font-black text-base"><dt>Total</dt><dd>{gbp(Number(data.order.totalAmount))}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-slate-700">Questions about this order? <a href="/contact" className="underline font-semibold">Contact us</a> and quote order #{data.order.id}.</p>
        </section>
      )}
    </div>
  );
}
