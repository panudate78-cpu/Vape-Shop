'use client';
import { useState } from 'react';
import { formatPrice } from '@/lib/format';

export default function TrackPage() {
  const [id, setId] = useState(''); const [email, setEmail] = useState('');
  const [data, setData] = useState<any>(null); const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr(null);
    const r = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: Number(id), email }) });
    const d = await r.json(); setLoading(false);
    if (!r.ok) { setErr(d.error || 'Not found'); setData(null); return; }
    setData(d);
  };
  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold">Track an order</h1>
      <p className="text-zinc-400 text-sm mt-1">Enter your order ID and the email you used at checkout.</p>
      <form onSubmit={go} className="card space-y-3 mt-4">
        <div><label className="label">Order ID</label><input className="input" type="number" required value={id} onChange={(e) => setId(e.target.value)} /></div>
        <div><label className="label">Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn-primary w-full" disabled={loading}>{loading ? 'Looking up…' : 'Track order'}</button>
        {err && <p className="text-red-400 text-sm">{err}</p>}
      </form>
      {data && (
        <div className="card mt-4">
          <h2 className="font-bold">Order #{data.order.id}</h2>
          <div className="text-teal-300">{data.order.status} · {data.order.paymentStatus}</div>
          <ul className="divide-y divide-zinc-800 mt-3 text-sm">
            {data.items.map((i: any) => (
              <li key={i.id} className="py-2 flex justify-between"><span>{i.productName} ({i.variantLabel}) × {i.quantity}</span><span>{formatPrice(Number(i.unitPrice) * i.quantity)}</span></li>
            ))}
          </ul>
          <div className="border-t border-zinc-800 mt-3 pt-3 text-right font-bold text-teal-400">Total {formatPrice(data.order.totalAmount)}</div>
          {data.order.trackingNumber && <div className="mt-2 text-sm">Tracking: <span className="font-mono">{data.order.trackingNumber}</span></div>}
        </div>
      )}
    </div>
  );
}
