import Link from 'next/link';
import { db } from '@/db';
import { orders, orderItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { formatPrice } from '@/lib/format';
import { canViewOrder } from '@/lib/order-access';
import { BRAND } from '@/lib/brand';

export const dynamic = 'force-dynamic';

const STEPS = ['pending', 'processing', 'ready', 'shipped', 'collected'] as const;

function AddressBlock({ addr }: { addr: any }) {
  if (!addr) return <p className="text-slate-400 text-sm">No address on file.</p>;
  const parsed = typeof addr === 'string' ? (() => { try { return JSON.parse(addr); } catch { return addr; } })() : addr;
  const lines = [parsed.line1, parsed.line2, parsed.city, parsed.county, parsed.postcode].filter((x: any) => x && String(x).trim());
  return (
    <address className="not-italic text-sm text-slate-700 leading-relaxed mt-2">
      {lines.map((l: string, i: number) => <div key={i}>{l}</div>)}
    </address>
  );
}

function statusLabel(s: string) {
  return { pending: 'Payment pending', processing: 'Processing', ready: 'Ready for collection', shipped: 'Shipped', collected: 'Collected', paid: 'Paid', cancelled: 'Cancelled', unfulfilled: 'Paid', refunded: 'Refunded' }[s] || s;
}

export default async function OrderPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  const id = Number(params.id);
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return <div className="card text-center py-16">Order not found.</div>;
  // Guests see their order in the browser that placed it. On another device they use Track order.
  if (!canViewOrder(s, order)) return <div className="card text-center py-16">We could not find that order in this browser. <Link className="underline" href="/track">Track an order</Link> with your order number and email.</div>;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));

  // Progress follows fulfilment (what happens to the goods), with payment shown separately.
  const fs = order.fulfilmentStatus || 'unfulfilled';
  const paidOk = order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded' || order.paymentStatus === 'refunded';
  const trackIndex = (() => {
    if (fs === 'cancelled') return -1;
    if (fs === 'collected' || fs === 'delivered') return 4;
    if (fs === 'shipped' || fs === 'ready') return 3;
    if (fs === 'processing') return 2;
    return paidOk ? 1 : 0;
  })();
  const steps = order.collectionMode === 'collect'
    ? ['Ordered', 'Paid', 'Processing', 'Ready', 'Collected']
    : ['Ordered', 'Paid', 'Processing', 'Shipped', 'Delivered'];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">Order #{order.id}</h1>
          <div className="text-sm text-slate-500">Placed {new Date(order.createdAt!).toLocaleString()}</div>
        </div>
        <div className="mt-1 text-slate-900">{fs === 'cancelled' ? 'Cancelled' : statusLabel(fs === 'delivered' ? 'shipped' : fs === 'unfulfilled' ? (paidOk ? 'paid' : 'pending') : fs)}{order.paymentStatus === 'refunded' ? ' · refunded' : order.paymentStatus === 'partially_refunded' ? ' · partly refunded' : ''}</div>
        {order.collectedBy && order.collectionMode === 'collect' && <div className="text-sm mt-1 text-slate-600">Collected {order.collectedAt ? new Date(order.collectedAt).toLocaleDateString('en-GB') : ''}</div>}
        {order.trackingNumber && <div className="text-sm mt-1">Tracking: <span className="font-mono">{order.trackingNumber}</span> {order.carrier && `(${order.carrier})`}</div>}
        <div className="mt-6 flex justify-between text-xs">
          {steps.map((label, i) => (
            <div key={label} className={`flex-1 text-center ${i <= Math.max(trackIndex, order.paymentStatus === 'paid' ? 1 : 0) ? 'text-slate-900' : 'text-slate-500'}`}>
              <div className={`h-2 rounded-full mx-1 ${i <= Math.max(trackIndex, order.paymentStatus === 'paid' ? 1 : 0) ? 'bg-slate-900' : 'bg-slate-100'}`} />
              <div className="mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="font-bold mb-3">Items</h2>
        <ul className="divide-y divide-zinc-800">
          {items.map((i) => (
            <li key={i.id} className="py-2 flex justify-between">
              <div>
                <div className="font-medium">{i.productName}</div>
                <div className="text-xs text-slate-500">{i.variantLabel} · {i.sku} × {i.quantity}</div>
              </div>
              <div>{formatPrice(Number(i.unitPrice) * i.quantity)}</div>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-200 mt-3 pt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
          <div className="flex justify-between"><span>Shipping</span><span>{Number(order.shippingCost) === 0 ? 'Free' : formatPrice(order.shippingCost)}</span></div>
          {Number(order.discount) > 0 && <div className="flex justify-between text-slate-900"><span>Discount</span><span>-{formatPrice(order.discount)}</span></div>}
          <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="text-slate-900">{formatPrice(order.totalAmount)}</span></div>
        </div>
      </div>

      {order.collectionMode === 'collect' ? (
        <div className="card">
          <h2 className="font-bold">Click & Collect</h2>
          <p className="text-sm text-slate-700 mt-2">
            When your order shows “Ready for collection”, bring your order number (#{order.id}) and photo ID to:
          </p>
          <p className="text-sm text-slate-700 mt-1">{BRAND.name}, {BRAND.address.line1}, {BRAND.address.city} {BRAND.address.postcode}</p>
          <p className="text-xs text-slate-400 mt-2">We operate Challenge 25 — if you look under 25 you will be asked for ID.</p>
        </div>
      ) : order.shippingAddress ? (
        <div className="card">
          <h2 className="font-bold">Delivery address</h2>
          <AddressBlock addr={typeof order.shippingAddress === 'string' ? JSON.parse(order.shippingAddress) : order.shippingAddress} />
        </div>
      ) : null}

      <div className="flex gap-3">
        <Link href="/shop" className="btn-outline">Continue shopping</Link>
        {s.user && <Link href="/account" className="btn-primary">Your account</Link>}
      </div>
    </div>
  );
}
