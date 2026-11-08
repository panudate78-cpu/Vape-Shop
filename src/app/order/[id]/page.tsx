import Link from 'next/link';
import { db } from '@/db';
import { orders, orderItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { formatPrice } from '@/lib/format';
import { BRAND } from '@/lib/brand';

export const dynamic = 'force-dynamic';

const STEPS = ['pending', 'processing', 'ready', 'shipped', 'collected'] as const;

function AddressBlock({ addr }: { addr: any }) {
  if (!addr) return <p className="text-zinc-500 text-sm">No address on file.</p>;
  const parsed = typeof addr === 'string' ? (() => { try { return JSON.parse(addr); } catch { return addr; } })() : addr;
  const lines = [parsed.line1, parsed.line2, parsed.city, parsed.county, parsed.postcode].filter((x: any) => x && String(x).trim());
  return (
    <address className="not-italic text-sm text-zinc-200 leading-relaxed mt-2">
      {lines.map((l: string, i: number) => <div key={i}>{l}</div>)}
    </address>
  );
}

function statusLabel(s: string) {
  return { pending: 'Payment pending', processing: 'Processing', ready: 'Ready for collection', shipped: 'Shipped', collected: 'Collected', paid: 'Paid', cancelled: 'Cancelled', refunded: 'Refunded' }[s] || s;
}

export default async function OrderPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  const id = Number(params.id);
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return <div className="card text-center py-16">Order not found.</div>;
  const owns = (order.userId && s.user?.id === order.userId) || s.user?.role === 'ADMIN' || (order.guestEmail);
  if (!owns) return <div className="card text-center py-16">This order is not associated with your account.</div>;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));

  const trackIndex = (() => {
    if (order.collectionMode === 'collect') return ['pending', 'paid', 'processing', 'ready', 'collected'].indexOf(order.status);
    return ['pending', 'paid', 'processing', 'shipped', 'collected'].indexOf(order.status);
  })();
  const steps = order.collectionMode === 'collect'
    ? ['Ordered', 'Paid', 'Processing', 'Ready', 'Collected']
    : ['Ordered', 'Paid', 'Processing', 'Shipped', 'Delivered'];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">Order #{order.id}</h1>
          <div className="text-sm text-zinc-400">Placed {new Date(order.createdAt!).toLocaleString()}</div>
        </div>
        <div className="mt-1 text-teal-300">{statusLabel(order.status)}</div>
        {order.trackingNumber && <div className="text-sm mt-1">Tracking: <span className="font-mono">{order.trackingNumber}</span> {order.carrier && `(${order.carrier})`}</div>}
        <div className="mt-6 flex justify-between text-xs">
          {steps.map((label, i) => (
            <div key={label} className={`flex-1 text-center ${i <= Math.max(trackIndex, order.paymentStatus === 'paid' ? 1 : 0) ? 'text-teal-400' : 'text-zinc-600'}`}>
              <div className={`h-2 rounded-full mx-1 ${i <= Math.max(trackIndex, order.paymentStatus === 'paid' ? 1 : 0) ? 'bg-teal-500' : 'bg-zinc-800'}`} />
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
                <div className="text-xs text-zinc-400">{i.variantLabel} · {i.sku} × {i.quantity}</div>
              </div>
              <div>{formatPrice(Number(i.unitPrice) * i.quantity)}</div>
            </li>
          ))}
        </ul>
        <div className="border-t border-zinc-800 mt-3 pt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
          <div className="flex justify-between"><span>Shipping</span><span>{Number(order.shippingCost) === 0 ? 'Free' : formatPrice(order.shippingCost)}</span></div>
          {Number(order.discount) > 0 && <div className="flex justify-between text-teal-300"><span>Discount</span><span>-{formatPrice(order.discount)}</span></div>}
          <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="text-teal-400">{formatPrice(order.totalAmount)}</span></div>
        </div>
      </div>

      {order.collectionMode === 'collect' ? (
        <div className="card">
          <h2 className="font-bold">Click & Collect</h2>
          <p className="text-sm text-zinc-300 mt-2">
            When your order shows “Ready for collection”, bring your order number (#{order.id}) and photo ID to:
          </p>
          <p className="text-sm text-zinc-300 mt-1">{BRAND.name}, {BRAND.address.line1}, {BRAND.address.city} {BRAND.address.postcode}</p>
          <p className="text-xs text-zinc-500 mt-2">We operate Challenge 25 — if you look under 25 you will be asked for ID.</p>
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
