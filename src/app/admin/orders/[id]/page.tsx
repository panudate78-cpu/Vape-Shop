'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/format';

export default function AdminOrderDetail() {
  const params = useParams<{ id: string }>(); const router = useRouter();
  const [data, setData] = useState<any>(null); const [status, setStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState(''); const [carrier, setCarrier] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const r = await fetch(`/api/admin/orders/${params.id}`, { cache: 'no-store' });
    const d = await r.json(); setData(d); setStatus(d.order.status); setTrackingNumber(d.order.trackingNumber || ''); setCarrier(d.order.carrier || '');
  };
  useEffect(() => { load(); }, [params.id]);

  const save = async () => {
    setMsg(null);
    const r = await fetch(`/api/admin/orders/${params.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, trackingNumber: trackingNumber || null, carrier: carrier || null }),
    });
    if (r.ok) { setMsg('Saved.'); load(); } else setMsg('Save failed.');
  };

  if (!data) return <div className="text-zinc-400">Loading…</div>;
  const { order, items } = data;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-amber-400">Order #{order.id}</h1>
        <button className="btn-outline" onClick={() => router.back()}>Back</button>
      </div>
      <div className="card space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-zinc-400">Customer:</span> {order.guestEmail || `user#${order.userId}`}</div>
          <div><span className="text-zinc-400">Date:</span> {new Date(order.createdAt).toLocaleString()}</div>
          <div><span className="text-zinc-400">Mode:</span> {order.collectionMode}</div>
          <div><span className="text-zinc-400">Payment:</span> {order.paymentGateway} / {order.paymentStatus}</div>
          <div><span className="text-zinc-400">Promo:</span> {order.promoCode || '—'}</div>
          <div><span className="text-zinc-400">Total:</span> {formatPrice(order.totalAmount)}</div>
        </div>
        {order.shippingAddress && <pre className="text-xs bg-zinc-800 rounded p-2">{JSON.stringify(order.shippingAddress, null, 2)}</pre>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {['pending','paid','processing','ready','shipped','collected','cancelled','refunded'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="label">Tracking number</label><input className="input" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} /></div>
          <div><label className="label">Carrier</label><input className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Royal Mail / DPD / Evri…" /></div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-amber" onClick={save}>Save changes</button>
          {msg && <span className="text-sm text-teal-300">{msg}</span>}
        </div>
      </div>
      <div className="card">
        <h2 className="font-bold mb-2">Items</h2>
        <ul className="divide-y divide-zinc-800 text-sm">
          {items.map((i: any) => (
            <li key={i.id} className="py-2 flex justify-between">
              <div><div>{i.productName}</div><div className="text-xs text-zinc-400">{i.variantLabel} · {i.sku} × {i.quantity}</div></div>
              <div>{formatPrice(Number(i.unitPrice) * i.quantity)}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
