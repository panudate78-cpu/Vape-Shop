"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { gbp, ORDER_STATUSES } from "@/lib/format";

type O = {
  id: string; status: string; totalAmount: string; guestEmail?: string | null; trackingNumber?: string | null;
  carrier?: string | null; paymentGateway?: string | null; createdAt: string;
};

function OrdersInner() {
  const sp = useSearchParams();
  const [rows, setRows] = useState<O[]>([]);
  const [status, setStatus] = useState(sp.get("status") || "");
  const [editing, setEditing] = useState<Record<string, { status: string; trackingNumber: string; carrier: string }>>({});

  const load = async () => {
    const r = await fetch(status ? `/api/orders?status=${status}` : "/api/orders");
    const j = await r.json();
    setRows(j.orders || []);
  };
  useEffect(() => { load(); }, [status]);

  const save = async (o: O) => {
    const e = editing[o.id];
    if (!e) return;
    await fetch(`/api/orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) });
    setEditing({});
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-black text-white">Orders ({rows.length})</h2>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => setStatus("")} className={`rounded-full px-3 py-1 text-xs font-bold ${!status ? "bg-amber-400 text-black" : "bg-white/5 text-zinc-300"}`}>All</button>
          {ORDER_STATUSES.map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${status === s ? "bg-amber-400 text-black" : "bg-white/5 text-zinc-300"}`}>{s}</button>
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((o) => (
          <div key={o.id} className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link href={`/order/${o.id}`} className="font-mono text-violet-300 hover:underline">#{o.id.slice(0, 8)}</Link>
              <span className="text-zinc-500">{new Date(o.createdAt).toLocaleString()}</span>
              <span className="text-zinc-400">{o.guestEmail || "registered"} · {o.paymentGateway}</span>
              <span className="ml-auto text-base font-black text-white">{gbp(o.totalAmount)}</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <select value={editing[o.id]?.status ?? o.status} onChange={(e) => setEditing({ ...editing, [o.id]: { status: e.target.value, trackingNumber: editing[o.id]?.trackingNumber ?? o.trackingNumber ?? "", carrier: editing[o.id]?.carrier ?? o.carrier ?? "" } })} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs uppercase">
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={editing[o.id]?.trackingNumber ?? o.trackingNumber ?? ""} onChange={(e) => setEditing({ ...editing, [o.id]: { status: editing[o.id]?.status ?? o.status, trackingNumber: e.target.value, carrier: editing[o.id]?.carrier ?? o.carrier ?? "" } })} placeholder="Tracking number" className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-xs outline-none" />
              <input value={editing[o.id]?.carrier ?? o.carrier ?? ""} onChange={(e) => setEditing({ ...editing, [o.id]: { status: editing[o.id]?.status ?? o.status, trackingNumber: editing[o.id]?.trackingNumber ?? o.trackingNumber ?? "", carrier: e.target.value } })} placeholder="Carrier (Royal Mail…)" className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs outline-none" />
              <div className="flex gap-2">
                <button onClick={() => save(o)} className="flex-1 rounded-lg bg-amber-400 py-2 text-xs font-black text-black">Update</button>
                <Link href={`/order/${o.id}`} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold">View</Link>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-zinc-500">No orders in this status.</p>}
      </div>
    </div>
  );
}

export default function AdminOrdersPage() {
  return <Suspense fallback={<div className="text-zinc-400">Loading…</div>}><OrdersInner /></Suspense>;
}
