"use client";
import { useState } from "react";
import Link from "next/link";
import { gbp } from "@/lib/format";

export default function TrackPage() {
  const [id, setId] = useState("");
  const [order, setOrder] = useState<{ id: string; status: string; totalAmount: string; trackingNumber?: string | null; carrier?: string | null; createdAt: string } | null>(null);
  const [err, setErr] = useState("");
  const lookup = async () => {
    setErr(""); setOrder(null);
    const clean = id.trim();
    if (!clean) { setErr("Enter an order ID"); return; }
    const r = await fetch(`/api/orders/${clean}`);
    const j = await r.json();
    if (!r.ok) { setErr(j.error || "Not found"); return; }
    setOrder(j.order);
  };
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-black text-white">Track your order</h1>
      <p className="text-sm text-zinc-400">Paste the order ID from your confirmation (e.g. from /account).</p>
      <div className="mt-4 flex gap-2">
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Order ID" className="flex-1 rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 font-mono text-sm outline-none" />
        <button onClick={lookup} className="rounded-xl bg-teal-500 px-5 py-3 text-sm font-extrabold text-white">Track</button>
      </div>
      {err && <p className="mt-3 text-sm font-bold text-red-400">{err}</p>}
      {order && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <p className="font-mono text-xs text-teal-300">#{order.id}</p>
          <p className="mt-1 text-lg font-black text-white uppercase">{order.status}</p>
          <p className="text-sm text-zinc-400">{gbp(order.totalAmount)} · {new Date(order.createdAt).toLocaleString()}</p>
          {order.trackingNumber ? <p className="mt-2 rounded-xl bg-emerald-400/10 p-3 text-sm font-bold text-emerald-300">📦 {order.carrier}: {order.trackingNumber}</p> : <p className="mt-2 text-sm text-zinc-500">No tracking yet — we&apos;ll update on dispatch.</p>}
          <Link href={`/order/${order.id}`} className="mt-3 inline-block text-sm font-bold text-teal-300 underline">Full details →</Link>
        </div>
      )}
    </div>
  );
}
