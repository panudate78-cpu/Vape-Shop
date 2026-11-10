'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { gbp } from '@/lib/format';
import { customerLabel, sourceBadge } from '@/lib/admin-helpers';

const STATUSES = ['', 'pending', 'paid', 'processing', 'ready', 'shipped', 'collected', 'cancelled', 'refunded'];
const CHANNELS = [
  { id: '', label: 'All channels' },
  { id: 'online', label: 'Online (delivery + collect)' },
  { id: 'pos', label: 'In-store (POS)' },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function paymentLabel(o: any) {
  if ((o.source || '').toLowerCase() === 'pos') {
    const m = (o.paymentMethod || '').toLowerCase();
    if (m === 'cash') return 'Cash';
    if (m === 'card') return 'Card';
    return o.paymentMethod || 'POS';
  }
  return o.paymentStatus || '—';
}

export default function AdminOrdersPage() {
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (channel) params.set('source', channel);
      const r = await fetch('/api/admin/orders' + (params.toString() ? `?${params}` : ''), { cache: 'no-store' });
      if (!r.ok) {
        const t = await r.text();
        setErr(`Failed to load orders (${r.status}): ${t.slice(0, 200)}`);
        setLoading(false);
        return;
      }
      const j = await r.json();
      setOrders(Array.isArray(j) ? j : (j.orders || []));
    } catch (e: any) {
      setErr(`Network error: ${e?.message || 'check your connection'}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, channel]);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-amber-400">Orders</h1>
        <div className="flex flex-wrap gap-2">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white">
            {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white">
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-900/25 p-4 text-sm text-red-200">
          ❌ {err}
          <button onClick={load} className="ml-3 rounded bg-red-500/20 px-3 py-1 text-xs font-bold text-red-100 hover:bg-red-500/30">Retry</button>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-left"><tr>
            <th className="p-3">#</th>
            <th className="p-3">Customer</th>
            <th className="p-3">Date</th>
            <th className="p-3">Channel</th>
            <th className="p-3">Status</th>
            <th className="p-3">Payment</th>
            <th className="p-3 text-right">Total</th>
          </tr></thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="p-6 text-center text-zinc-500">Loading…</td></tr>
            )}
            {!loading && orders.map((o) => (
              <tr key={o.id} className="border-t border-zinc-800 hover:bg-zinc-900/60">
                <td className="p-3"><Link href={`/admin/orders/${o.id}`} className="text-amber-400 underline font-bold">#{o.id}</Link></td>
                <td className="p-3">
                  <div className="text-white font-medium">{customerLabel(o)}</div>
                  {o.customerEmail && o.customerName && <div className="text-xs text-zinc-500">{o.customerEmail}</div>}
                </td>
                <td className="p-3 text-zinc-400 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                <td className="p-3">{sourceBadge(o)}</td>
                <td className="p-3"><span className="rounded-full bg-amber-500/20 text-amber-300 px-2.5 py-0.5 text-xs font-bold">{o.status}</span></td>
                <td className="p-3 text-zinc-300">{paymentLabel(o)}</td>
                <td className="p-3 text-right font-bold text-white whitespace-nowrap">{gbp(o.totalAmount)}</td>
              </tr>
            ))}
            {!loading && orders.length === 0 && !err && (
              <tr><td colSpan={7} className="p-6 text-center text-zinc-500">No orders match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
