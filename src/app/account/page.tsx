"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { gbp } from "@/lib/format";

type Order = {
  id: string; status: string; totalAmount: string; createdAt: string; trackingNumber?: string | null; carrier?: string | null;
  items: { productName?: string | null; variantLabel?: string | null; quantity: number; unitPrice: string; variantId?: string | null }[];
};

export default function AccountPage() {
  const { user, refreshUser } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [guestEmail, setGuestEmail] = useState("");
  const [addresses, setAddresses] = useState<{ id: string; label?: string | null; line1?: string | null; city?: string | null; postcode?: string | null; fullName?: string | null }[]>([]);
  const [newAddr, setNewAddr] = useState({ label: "Home", fullName: "", line1: "", city: "", postcode: "", phone: "" });

  const loadOrders = async (email?: string) => {
    const url = email ? `/api/orders?email=${encodeURIComponent(email)}` : "/api/orders";
    const r = await fetch(url);
    const j = await r.json();
    setOrders(j.orders || []);
  };
  useEffect(() => {
    refreshUser();
    loadOrders();
    fetch("/api/addresses").then((r) => r.json()).then((j) => setAddresses(j.addresses || []));
  }, []);

  const reorder = async (o: Order) => {
    alert("Reorder these items:\n" + o.items.map((i) => `${i.quantity}× ${i.productName} (${i.variantLabel})`).join("\n") + "\n\nTip: use Track/Order view to re-add from the shop.");
  };

  const saveAddr = async () => {
    const r = await fetch("/api/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newAddr) });
    if (r.ok) {
      const j = await r.json();
      setAddresses([...addresses, j.address]);
      setNewAddr({ label: "Home", fullName: "", line1: "", city: "", postcode: "", phone: "" });
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-black text-white">My account</h1>
      {!user && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <p className="text-sm text-zinc-300">You&apos;re browsing as a guest. <Link href="/login" className="text-teal-300 underline">Login</Link> to see full history, or look up guest orders:</p>
          <div className="mt-2 flex gap-2">
            <input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="guest email" className="flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none sm:max-w-xs" />
            <button onClick={() => loadOrders(guestEmail)} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold">Find orders</button>
          </div>
        </div>
      )}
      {user && <p className="mt-1 text-sm text-zinc-400">{user.email} · {user.role}</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <h2 className="font-extrabold text-white">Order history & tracking</h2>
          <div className="mt-3 space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/order/${o.id}`} className="font-mono text-xs text-teal-300 hover:underline">#{o.id.slice(0, 8)}</Link>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${o.status === "shipped" ? "bg-emerald-400/15 text-emerald-300" : o.status === "cancelled" ? "bg-red-500/15 text-red-300" : "bg-amber-400/15 text-amber-300"}`}>{o.status}</span>
                  <span className="ml-auto font-extrabold text-white">{gbp(o.totalAmount)}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{new Date(o.createdAt).toLocaleString()} {o.trackingNumber ? `· ${o.carrier || "Courier"} ${o.trackingNumber}` : "· tracking added after dispatch"}</p>
                <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                  {o.items.map((it, i) => <li key={i}>{it.quantity}× {it.productName} <span className="text-zinc-500">({it.variantLabel})</span></li>)}
                </ul>
                <div className="mt-2 flex gap-2">
                  <Link href={`/order/${o.id}`} className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold">View / Track</Link>
                  <button onClick={() => reorder(o)} className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold">Reorder</button>
                </div>
              </div>
            ))}
            {orders.length === 0 && <p className="text-sm text-zinc-500">No orders yet. <Link href="/shop" className="text-teal-300 underline">Start shopping →</Link></p>}
          </div>
        </div>
        <div>
          <h2 className="font-extrabold text-white">Saved addresses</h2>
          <div className="mt-3 space-y-2">
            {addresses.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/10 bg-zinc-900 p-3 text-xs text-zinc-300">
                <p className="font-bold text-white">{a.label} — {a.fullName}</p>
                <p>{a.line1}, {a.city} {a.postcode}</p>
              </div>
            ))}
          </div>
          {user && (
            <div className="mt-3 rounded-xl border border-white/10 bg-zinc-900 p-3 space-y-2">
              <p className="text-xs font-bold text-zinc-300">Add address</p>
              <input value={newAddr.fullName} onChange={(e) => setNewAddr({ ...newAddr, fullName: e.target.value })} placeholder="Full name" className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs outline-none" />
              <input value={newAddr.line1} onChange={(e) => setNewAddr({ ...newAddr, line1: e.target.value })} placeholder="Line 1" className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs outline-none" />
              <div className="grid grid-cols-2 gap-2">
                <input value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} placeholder="City" className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs outline-none" />
                <input value={newAddr.postcode} onChange={(e) => setNewAddr({ ...newAddr, postcode: e.target.value })} placeholder="Postcode" className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs outline-none" />
              </div>
              <button onClick={saveAddr} className="w-full rounded-lg bg-teal-500 py-2 text-xs font-extrabold text-black">Save</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
