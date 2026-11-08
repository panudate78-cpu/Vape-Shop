'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { gbp } from '@/lib/format';

const STATUSES = ['', 'pending', 'paid', 'processing', 'ready', 'shipped', 'collected', 'cancelled', 'refunded'];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function customerLabel(o: any) {
  const name = o.customerName || null;
  const email = o.customerEmail || o.guestEmail || null;
  if (name && email) return `${name} <${email}>`;
  return email || (o.userId ? `Account #${o.userId}` : 'Guest');
}

export default function AdminOrdersPage() {
  const [status, setStatus] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const load = async () => {
    const r = await fetch('/api/admin/orders' + (status ? `?status=${status}` : ''), { cache: 'no-store' });
    setOrders(await r.json());
  };
  useEffect(() => { load(); }, [status]);
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-amber-400">Orders</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm max-w-xs text-white">
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-0 overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-left"><tr>
            <th className="p-3">#</th>
            <th className="p-3">Customer</th>
            <th className="p-3">Date</th>
            <th className="p-3">Status</th>
            <th className="p-3">Payment</th>
            <th className="p-3">Mode</th>
            <th className="p-3 text-right">Total</th>
          </tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-zinc-800 hover:bg-zinc-900/60">
                <td className="p-3"><Link href={`/admin/orders/${o.id}`} className="text-teal-300 underline">#{o.id}</Link></td>
                <td className="p-3">
                  <div className="text-white font-medium">{customerLabel(o)}</div>
                  {o.customerEmail && o.customerName && <div className="text-xs text-zinc-500">{o.customerEmail}</div>}
                </td>
                <td className="p-3 text-zinc-400">{formatDate(o.createdAt)}</td>
                <td className="p-3"><span className="rounded-full bg-amber-500/20 text-amber-300 px-2.5 py-0.5 text-xs font-bold">{o.status}</span></td>
                <td className="p-3 text-zinc-400">{o.paymentStatus}</td>
                <td className="p-3 text-zinc-400 capitalize">{o.collectionMode}</td>
                <td className="p-3 text-right font-bold text-white">{gbp(o.totalAmount)}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-zinc-500">No orders.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
