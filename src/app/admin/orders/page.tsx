'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/format';

const STATUSES = ['', 'pending', 'paid', 'processing', 'ready', 'shipped', 'collected', 'cancelled', 'refunded'];

export default function AdminOrdersPage() {
  const [status, setStatus] = useState(''); const [orders, setOrders] = useState<any[]>([]);
  const load = async () => {
    const r = await fetch('/api/admin/orders' + (status ? `?status=${status}` : ''), { cache: 'no-store' });
    setOrders(await r.json());
  };
  useEffect(() => { load(); }, [status]);
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-amber-400">Orders</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input max-w-xs">
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>
      <div className="card p-0 overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-left"><tr>
            <th className="p-3">#</th><th className="p-3">Customer</th><th className="p-3">Date</th>
            <th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3">Mode</th><th className="p-3 text-right">Total</th>
          </tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-zinc-800 hover:bg-zinc-900/60">
                <td className="p-3"><Link href={`/admin/orders/${o.id}`} className="text-teal-300 underline">#{o.id}</Link></td>
                <td className="p-3">{o.guestEmail || `user#${o.userId}`}</td>
                <td className="p-3 text-zinc-400">{new Date(o.createdAt).toLocaleString()}</td>
                <td className="p-3"><span className="tag bg-amber-500/20 text-amber-300">{o.status}</span></td>
                <td className="p-3 text-zinc-400">{o.paymentStatus}</td>
                <td className="p-3 text-zinc-400">{o.collectionMode}</td>
                <td className="p-3 text-right font-semibold">{formatPrice(o.totalAmount)}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-zinc-500">No orders.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
