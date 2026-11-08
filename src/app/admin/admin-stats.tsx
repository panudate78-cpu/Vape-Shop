'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatPrice } from '@/lib/format';

export function AdminStatsClient() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch('/api/admin/stats', { cache: 'no-store' }).then((r) => r.json()).then(setD); }, []);
  if (!d) return <div className="text-zinc-400 mt-6">Loading…</div>;
  return (
    <div className="mt-6 space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card"><div className="text-xs text-zinc-400">Revenue (paid)</div><div className="text-2xl font-bold text-teal-400">{formatPrice(d.revenue)}</div></div>
        <div className="card"><div className="text-xs text-zinc-400">Paid orders</div><div className="text-2xl font-bold">{d.paidOrders}</div></div>
        <div className="card"><div className="text-xs text-zinc-400">Pending</div><div className="text-2xl font-bold text-amber-400">{d.pendingOrders}</div></div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-bold mb-3">Low stock</h2>
          {d.lowStock.length === 0 ? <p className="text-sm text-zinc-400">All items above threshold.</p> : (
            <ul className="divide-y divide-zinc-800 text-sm">
              {d.lowStock.map((v: any) => (
                <li key={v.id} className="py-2 flex justify-between">
                  <div>
                    <div>{v.productName}</div>
                    <div className="text-xs text-zinc-500">{v.flavor} · {v.nicotineStrength} · {v.bottleSize} · {v.sku}</div>
                  </div>
                  <div className={v.stockQuantity === 0 ? 'text-red-400 font-semibold' : 'text-amber-300 font-semibold'}>{v.stockQuantity}</div>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/inventory" className="btn-outline mt-3 inline-block">Manage inventory</Link>
        </div>
        <div className="card">
          <h2 className="font-bold mb-3">Recent orders</h2>
          <ul className="divide-y divide-zinc-800 text-sm">
            {d.recent.map((o: any) => (
              <li key={o.id} className="py-2 flex justify-between items-center">
                <Link href={`/admin/orders/${o.id}`} className="text-teal-300 underline">#{o.id}</Link>
                <span className="text-zinc-400 text-xs">{new Date(o.createdAt).toLocaleString()}</span>
                <span className="tag bg-zinc-800 text-zinc-300">{o.status}</span>
                <span className="font-semibold">{formatPrice(o.totalAmount)}</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/orders" className="btn-outline mt-3 inline-block">All orders</Link>
        </div>
      </div>
    </div>
  );
}
