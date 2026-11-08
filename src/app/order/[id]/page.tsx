"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { gbp } from "@/lib/format";

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const paid = sp.get("paid");
  const [order, setOrder] = useState<{
    id: string; status: string; totalAmount: string; subtotal: string; discount: string; shippingCost: string;
    trackingNumber?: string | null; carrier?: string | null; paymentGateway?: string | null; createdAt: string;
    shippingAddress?: Record<string, string>;
    items: { productName?: string | null; variantLabel?: string | null; sku?: string | null; quantity: number; unitPrice: string }[];
  } | null>(null);

  useEffect(() => {
    fetch(`/api/orders/${id}`).then((r) => r.json()).then((j) => setOrder(j.order || null));
  }, [id]);

  if (!order) return <div className="p-10 text-center text-zinc-400">Loading order…</div>;
  const steps = ["pending", "paid", "processing", "shipped"];
  const idx = steps.indexOf(order.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {paid && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-center">
          <p className="text-2xl">✅</p>
          <h1 className="text-xl font-black text-white">Payment verified — order confirmed!</h1>
          <p className="mt-1 text-sm text-zinc-300">Webhook captured {gbp(order.totalAmount)} via {order.paymentGateway}. Stock has been deducted.</p>
        </div>
      )}
      <div className="mt-5 rounded-2xl border border-white/10 bg-zinc-900 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-sm text-teal-300">Order #{order.id.slice(0, 8)}</h2>
          <span className="rounded-full bg-white/10 px-3 py-0.5 text-xs font-extrabold uppercase">{order.status}</span>
          <span className="ml-auto font-black text-white">{gbp(order.totalAmount)}</span>
        </div>
        <div className="mt-4 flex items-center">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 items-center">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${i <= idx ? "bg-teal-500 text-black" : "bg-white/10 text-zinc-500"}`}>{i + 1}</div>
              <div className="ml-2 hidden text-[11px] font-bold uppercase text-zinc-300 sm:block">{s}</div>
              {i < steps.length - 1 && <div className={`mx-2 h-0.5 flex-1 ${i < idx ? "bg-teal-400" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-white/5 p-3 text-sm">
          {order.trackingNumber ? <p className="font-bold text-emerald-300">📦 {order.carrier || "Courier"} tracking: {order.trackingNumber}</p> : <p className="text-zinc-400">Tracking number will appear here once dispatched.</p>}
        </div>
        <div className="mt-4 space-y-2">
          {order.items.map((it, i) => (
            <div key={i} className="flex justify-between text-sm text-zinc-300"><span>{it.quantity}× {it.productName} <span className="text-zinc-500">({it.variantLabel})</span></span><span className="font-bold text-white">{gbp(parseFloat(it.unitPrice) * it.quantity)}</span></div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm text-zinc-400">
          <div className="flex justify-between"><span>Subtotal</span><span>{gbp(order.subtotal)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>−{gbp(order.discount)}</span></div>
          <div className="flex justify-between"><span>Shipping</span><span>{gbp(order.shippingCost)}</span></div>
        </div>
        <div className="mt-5 flex gap-2">
          <Link href="/shop" className="flex-1 rounded-xl bg-teal-500 py-3 text-center text-sm font-extrabold text-white">Continue shopping</Link>
          <Link href="/account" className="flex-1 rounded-xl border border-white/10 py-3 text-center text-sm font-bold">My orders</Link>
        </div>
      </div>
    </div>
  );
}
