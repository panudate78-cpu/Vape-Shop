'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { gbp } from '@/lib/format';
import { customerLabel, sourceBadge } from '@/lib/admin-helpers';

const PAYMENT = [
  { id: '', label: 'Any payment' }, { id: 'pending', label: 'Pending' }, { id: 'paid', label: 'Paid' },
  { id: 'failed', label: 'Failed' }, { id: 'partially_refunded', label: 'Part refunded' }, { id: 'refunded', label: 'Refunded' },
];
const FULFIL = [
  { id: '', label: 'Any fulfilment' }, { id: 'unfulfilled', label: 'Not started' }, { id: 'processing', label: 'Processing' },
  { id: 'ready', label: 'Ready to collect' }, { id: 'shipped', label: 'Shipped' }, { id: 'delivered', label: 'Delivered' },
  { id: 'collected', label: 'Collected' }, { id: 'cancelled', label: 'Cancelled' },
];
const CHANNEL = [{ id: '', label: 'All channels' }, { id: 'online', label: 'Online' }, { id: 'pos', label: 'In-store (till)' }];

const field = 'rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white';

function PaymentBadge({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    paid: ['Paid', 'bg-emerald-900/60 text-emerald-200'], pending: ['Unpaid', 'bg-zinc-800 text-zinc-300'],
    failed: ['Failed', 'bg-red-900/60 text-red-200'], partially_refunded: ['Part refunded', 'bg-amber-900/60 text-amber-200'],
    refunded: ['Refunded', 'bg-zinc-700 text-zinc-200'],
  };
  const [label, cls] = map[s] || [s || '—', 'bg-zinc-800 text-zinc-300'];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>;
}

function FulfilBadge({ s }: { s: string }) {
  const label = FULFIL.find((f) => f.id === s)?.label || s || 'Not started';
  const cls = s === 'cancelled' ? 'bg-red-900/50 text-red-200' : s === 'collected' || s === 'delivered' ? 'bg-emerald-900/50 text-emerald-200' : 'bg-sky-900/50 text-sky-200';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminOrdersPage() {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [channel, setChannel] = useState('');
  const [payment, setPayment] = useState('');
  const [fulfilment, setFulfilment] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      if (channel) p.set('channel', channel);
      if (payment) p.set('payment', payment);
      if (fulfilment) p.set('fulfilment', fulfilment);
      const r = await fetch(`/api/admin/orders?${p.toString()}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load orders');
      setOrders(Array.isArray(d) ? d : []);
    } catch (e: any) {
      setErr(e?.message || 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [q, from, to, channel, payment, fulfilment]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input className={field} placeholder="Order number, customer name or email" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          <input className={field} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input className={field} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <select className={field} value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNEL.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <select className={field} value={payment} onChange={(e) => setPayment(e.target.value)}>{PAYMENT.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <select className={field} value={fulfilment} onChange={(e) => setFulfilment(e.target.value)}>{FULFIL.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <button onClick={load} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-extrabold text-black">Search</button>
          <button onClick={() => { setQ(''); setFrom(''); setTo(''); setChannel(''); setPayment(''); setFulfilment(''); }} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/5">Clear</button>
        </div>
        <p className="text-xs text-zinc-500">Dates are UK calendar days. Up to 500 results, newest first.</p>
      </div>

      {err && <div className="rounded-xl bg-red-900/40 px-4 py-2 text-sm font-bold text-red-200">{err}</div>}
      {loading && <div className="text-zinc-400 text-sm">Loading orders…</div>}

      {!loading && (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr><th className="p-3">Order</th><th className="p-3">Placed</th><th className="p-3">Customer</th><th className="p-3">Channel</th><th className="p-3">Payment</th><th className="p-3">Fulfilment</th><th className="p-3 text-right">Total</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="p-3"><Link href={`/admin/orders/${o.id}`} className="font-bold text-amber-300 hover:underline">#{o.id}</Link></td>
                  <td className="p-3 text-zinc-300 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                  <td className="p-3 text-white">{customerLabel(o)}</td>
                  <td className="p-3">{sourceBadge(o)}{o.collectionMode === 'collect' && o.source !== 'pos' && <span className="ml-1 text-[11px] text-zinc-400">collect</span>}{o.collectionMode !== 'collect' && o.source !== 'pos' && <span className="ml-1 text-[11px] text-zinc-400">delivery</span>}</td>
                  <td className="p-3"><PaymentBadge s={o.source === 'pos' ? 'paid' : o.paymentStatus} />{Number(o.refundedAmount) > 0 && <span className="ml-1 text-[11px] text-zinc-400">−{gbp(o.refundedAmount)}</span>}</td>
                  <td className="p-3"><FulfilBadge s={o.fulfilmentStatus || 'unfulfilled'} /></td>
                  <td className="p-3 text-right font-bold text-white">{gbp(o.totalAmount)}</td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan={7} className="p-8 text-center text-zinc-500">No orders match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
