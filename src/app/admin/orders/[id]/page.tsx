'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { gbp } from '@/lib/format';
import { customerLabel, sourceBadge } from '@/lib/admin-helpers';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function AddressBlock({ addr }: { addr: any }) {
  if (!addr) return <p className="text-zinc-500 text-sm">No address on file.</p>;
  const lines = [addr.line1, addr.line2, addr.city, addr.county, addr.postcode].filter((x: any) => x && String(x).trim());
  return (
    <address className="not-italic text-sm text-zinc-200 leading-relaxed">
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </address>
  );
}

function paymentLine(o: any): string {
  const src = String(o.source || 'online').toLowerCase();
  if (src === 'pos') {
    const m = String(o.paymentMethod || '').toLowerCase();
    if (m === 'cash') return 'Cash (in-store)';
    if (m === 'card') return 'Card (in-store)';
    return o.paymentMethod ? `${o.paymentMethod} (in-store)` : 'In-store';
  }
  const gw = o.paymentGateway ? String(o.paymentGateway) : '—';
  const ps = o.paymentStatus ? String(o.paymentStatus) : '';
  return ps ? `${gw} · ${ps}` : gw;
}

export default function AdminOrderDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  const load = async () => {
    const r = await fetch(`/api/admin/orders/${params.id}`, { cache: 'no-store' });
    const d = await r.json();
    setData(d);
    setStatus(d.order.status);
    setTrackingNumber(d.order.trackingNumber || '');
    setCarrier(d.order.carrier || '');
  };
  useEffect(() => { load(); }, [params.id]);

  const save = async () => {
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/orders/${params.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, trackingNumber: trackingNumber || null, carrier: carrier || null }),
      });
      if (!r.ok) { setMsg({ text: 'Save failed.', kind: 'err' }); return; }
      setMsg({ text: 'Saved.', kind: 'ok' }); load();
    } catch (e: any) {
      setMsg({ text: `Network error: ${e?.message || 'check your connection'}`, kind: 'err' });
    }
  };

  if (!data) return <div className="text-zinc-400 py-10 text-center">Loading…</div>;
  const { order, items } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black text-amber-400">Order #{order.id}</h1>
          {sourceBadge(order)}
        </div>
        <button className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/5" onClick={() => router.back()}>Back</button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><span className="text-zinc-500 block text-xs uppercase tracking-wide">Customer</span>
            <div className="text-white font-semibold">{customerLabel(order)}</div>
            {order.customerEmail && order.customerName && <div className="text-zinc-400">{order.customerEmail}</div>}
          </div>
          <div><span className="text-zinc-500 block text-xs uppercase tracking-wide">Date placed</span><span className="text-zinc-200">{formatDate(order.createdAt)}</span></div>
          <div><span className="text-zinc-500 block text-xs uppercase tracking-wide">Channel</span>{sourceBadge(order)}</div>
          <div><span className="text-zinc-500 block text-xs uppercase tracking-wide">Payment</span><span className="text-zinc-200">{paymentLine(order)}</span></div>
          <div><span className="text-zinc-500 block text-xs uppercase tracking-wide">Promo</span><span className="text-zinc-200">{order.promoCode || '—'}</span></div>
          <div><span className="text-zinc-500 block text-xs uppercase tracking-wide">Total</span><span className="text-amber-400 font-black text-lg">{gbp(order.totalAmount)}</span></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div><label className="block text-xs font-bold text-zinc-300 mb-1">Status</label>
            <select className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm w-full text-white" value={status} onChange={(e) => setStatus(e.target.value)}>
              {['pending','paid','processing','ready','shipped','collected','cancelled','refunded'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-bold text-zinc-300 mb-1">Tracking number</label><input className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm w-full text-white" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} /></div>
          <div><label className="block text-xs font-bold text-zinc-300 mb-1">Carrier</label><input className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm w-full text-white" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Royal Mail / DPD / Evri…" /></div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button className="rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-5 py-2.5 text-sm disabled:opacity-60" onClick={save}>Save changes</button>
          {msg && <span className={`text-sm ${msg.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</span>}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
        <h2 className="font-extrabold text-white mb-3">Items</h2>
        <ul className="divide-y divide-white/10 text-sm">
          {items.map((i: any) => (
            <li key={i.id} className="py-3 flex justify-between">
              <div>
                <div className="font-semibold text-white">{i.productName}</div>
                <div className="text-xs text-zinc-400">{i.variantLabel} · {i.sku} × {i.quantity}</div>
              </div>
              <div className="font-bold text-white">{gbp(Number(i.unitPrice) * i.quantity)}</div>
            </li>
          ))}
        </ul>
        <div className="border-t border-white/10 mt-3 pt-3 space-y-1 text-sm text-right">
          <div className="text-zinc-400">Subtotal: <span className="text-white ml-2">{gbp(order.subtotal)}</span></div>
          <div className="text-zinc-400">Shipping: <span className="text-white ml-2">{Number(order.shippingCost) === 0 ? 'Free' : gbp(order.shippingCost)}</span></div>
          {Number(order.discount) > 0 && <div className="text-amber-300">Discount: <span className="ml-2">-{gbp(order.discount)}</span></div>}
          <div className="text-amber-400 font-black text-lg pt-1">Total {gbp(order.totalAmount)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
        <h2 className="font-extrabold text-white mb-2">{order.collectionMode === 'collect' ? 'Collection' : 'Delivery'} address</h2>
        {order.collectionMode === 'collect' ? (
          <p className="text-sm text-zinc-300">Customer will collect in store — ID check required (Challenge 25).</p>
        ) : (
          <AddressBlock addr={order.shippingAddress} />
        )}
        {order.trackingNumber && (
          <div className="mt-4 text-sm border-t border-white/10 pt-3">
            <div className="text-zinc-500 text-xs uppercase tracking-wide">Tracking</div>
            <div className="font-mono text-white mt-1">{order.trackingNumber}{order.carrier ? ` · ${order.carrier}` : ''}</div>
          </div>
        )}
      </div>
    </div>
  );
}
