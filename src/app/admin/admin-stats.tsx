'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { gbp } from '@/lib/format';

function customerLabel(o: any) {
  const name = o.customerName || null;
  const email = o.customerEmail || o.guestEmail || null;
  if (name && email) return name;
  return email || (o.userId ? `Account #${o.userId}` : 'Guest');
}

export function AdminStatsClient() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch('/api/admin/stats', { cache: 'no-store' }).then((r) => r.json()).then(setD); }, []);
  if (!d) return <div className="text-zinc-400 mt-6">Loading…</div>;
  return (
    <div className="mt-6 space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5"><div className="text-xs text-zinc-400 font-bold uppercase tracking-wide">Revenue (paid)</div><div className="text-3xl font-black text-teal-400 mt-1">{gbp(d.revenue)}</div></div>
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5"><div className="text-xs text-zinc-400 font-bold uppercase tracking-wide">Paid orders</div><div className="text-3xl font-black mt-1 text-white">{d.paidOrders}</div></div>
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5"><div className="text-xs text-zinc-400 font-bold uppercase tracking-wide">Pending</div><div className="text-3xl font-black mt-1 text-amber-400">{d.pendingOrders}</div></div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h2 className="font-extrabold text-white mb-3">Low stock</h2>
          {d.lowStock.length === 0 ? <p className="text-sm text-zinc-400">All items above threshold.</p> : (
            <ul className="divide-y divide-white/10 text-sm">
              {d.lowStock.map((v: any) => (
                <li key={v.id} className="py-2 flex justify-between">
                  <div>
                    <div className="text-white font-medium">{v.productName}</div>
                    <div className="text-xs text-zinc-500">{v.flavor} · {v.nicotineStrength} · {v.bottleSize} · {v.sku}</div>
                  </div>
                  <div className={v.stockQuantity === 0 ? 'text-red-400 font-bold' : 'text-amber-300 font-bold'}>{v.stockQuantity}</div>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/inventory" className="mt-4 inline-block rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/5">Manage inventory</Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h2 className="font-extrabold text-white mb-3">Recent orders</h2>
          <ul className="divide-y divide-white/10 text-sm">
            {d.recent.map((o: any) => (
              <li key={o.id} className="py-2.5 flex justify-between items-center gap-3">
                <Link href={`/admin/orders/${o.id}`} className="text-teal-300 underline font-bold">#{o.id}</Link>
                <span className="text-zinc-300 text-sm truncate flex-1">{customerLabel(o)}</span>
                <span className="text-zinc-500 text-xs whitespace-nowrap">{new Date(o.createdAt).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                <span className="rounded-full bg-amber-500/20 text-amber-300 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">{o.status}</span>
                <span className="font-bold text-white whitespace-nowrap">{gbp(o.totalAmount)}</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/orders" className="mt-4 inline-block rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/5">All orders</Link>
        </div>
      </div>
    </div>
  );
}
