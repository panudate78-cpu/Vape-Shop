"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { gbp } from "@/lib/format";

export default function AdminOverview() {
  const [data, setData] = useState<{ stats: Record<string, string>; recent: { id: string; total_amount: string; status: string; created_at: string; guest_email: string }[] } | null>(null);
  const [low, setLow] = useState<{ sku: string; productName?: string | null; stockQuantity: number; lowStockThreshold: number }[]>([]);
  useEffect(() => {
    fetch("/api/admin/stats").then((r) => r.json()).then(setData);
    fetch("/api/variants?lowOnly=1").then((r) => r.json()).then((j) => setLow(j.variants || []));
  }, []);
  if (!data) return <p className="text-zinc-400">Loading stats…</p>;
  const cards = [
    { label: "Revenue (paid+)", value: gbp(data.stats.revenue || 0), href: "/admin/orders" },
    { label: "Paid orders", value: data.stats.paidOrders, href: "/admin/orders" },
    { label: "Pending orders", value: data.stats.pending, href: "/admin/orders?status=pending" },
    { label: "Low stock SKUs", value: data.stats.lowStock, href: "/admin/inventory?filter=low" },
    { label: "Out of stock", value: data.stats.outOfStock, href: "/admin/inventory?filter=out" },
    { label: "Products", value: data.stats.products, href: "/admin/products" },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-2xl border border-white/10 bg-zinc-900 p-5 hover:border-amber-400/60">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{c.label}</p>
            <p className="mt-1 text-2xl font-black text-white">{c.value}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h3 className="font-extrabold text-white">Recent orders</h3>
          <div className="mt-3 space-y-2">
            {(data.recent || []).map((o) => (
              <Link key={o.id} href="/admin/orders" className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs hover:bg-white/10">
                <span className="font-mono text-violet-300">#{o.id.slice(0, 8)}</span>
                <span className="text-zinc-400">{o.status}</span>
                <span className="font-bold text-white">{gbp(o.total_amount)}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
          <h3 className="font-extrabold text-white">⚠ Low stock alerts ({low.length})</h3>
          <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
            {low.slice(0, 12).map((v) => (
              <div key={v.sku} className="flex justify-between rounded-lg bg-black/30 px-3 py-1.5 text-xs">
                <span className="text-zinc-200">{v.productName} · <span className="font-mono text-amber-300">{v.sku}</span></span>
                <span className={`font-black ${v.stockQuantity <= 0 ? "text-red-400" : "text-amber-300"}`}>{v.stockQuantity} left</span>
              </div>
            ))}
            {low.length === 0 && <p className="text-xs text-zinc-400">All healthy ✓</p>}
          </div>
          <Link href="/admin/inventory?filter=low" className="mt-3 inline-block rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-black">Manage inventory →</Link>
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-900 p-5 text-xs leading-relaxed text-zinc-400">
        <p className="font-extrabold text-white">Setup & env</p>
        <p className="mt-1 font-mono">PAYMENT_GATEWAY=mock · PAYMENT_MODE=sandbox · MOCK_WEBHOOK_SECRET=wh_mock_secret · ADMIN_EMAIL · ADMIN_PASSWORD · NEXT_PUBLIC_AGE_THRESHOLD=18</p>
        <p className="mt-1">Checkout creates a <b>pending</b> order + payment intent, then <b>POST /api/webhooks/payment</b> verifies the signature and only then deducts stock — swap gateways via env without touching code. See README section in footer.</p>
      </div>
    </div>
  );
}
