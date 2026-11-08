"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { gbp, isAdult } from "@/lib/format";
import { BRAND, fullAddress } from "@/lib/brand";

export default function CheckoutPage() {
  const { cart, subtotal, clearCart, user } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [addr, setAddr] = useState({ fullName: "", line1: "", line2: "", city: "", postcode: "", country: "United Kingdom", phone: "" });
  const [method, setMethod] = useState("standard");
  const [promo, setPromo] = useState("");
  const [discount, setDiscount] = useState(0);
  const [dob, setDob] = useState("");
  const [compliance, setCompliance] = useState(false);
  const [cardLast4, setCardLast4] = useState("4242");
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<{ id: string; label?: string | null; line1?: string | null; city?: string | null; postcode?: string | null }[]>([]);

  useEffect(() => {
    try { setPromo(localStorage.getItem("vs_promo") || ""); } catch {}
    if (user) {
      fetch("/api/addresses").then((r) => r.json()).then((j) => {
        setSaved(j.addresses || []);
        const d = (j.addresses || []).find((a: { isDefault: boolean }) => a.isDefault) || (j.addresses || [])[0];
        if (d) setAddr({ fullName: d.fullName || "", line1: d.line1 || "", line2: d.line2 || "", city: d.city || "", postcode: d.postcode || "", country: d.country || "United Kingdom", phone: d.phone || "" });
      });
    }
  }, [user]);

  useEffect(() => {
    if (!promo) { setDiscount(0); return; }
    fetch("/api/promos/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promo, subtotal }) })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setDiscount(ok ? j.promo.discount : 0))
      .catch(() => setDiscount(0));
  }, [promo, subtotal]);

  const shipCost = method === "express" ? 7.99 : method === "standard" ? (subtotal - discount >= 50 ? 0 : 3.99) : 0;
  const total = Math.max(0, subtotal - discount + shipCost);

  const place = async () => {
    setErr("");
    if (!cart.length) { setErr("Cart is empty"); return; }
    if (!dob || !isAdult(dob)) { setErr(`Valid date of birth proving ${process.env.NEXT_PUBLIC_AGE_THRESHOLD || 18}+ required.`); return; }
    if (!compliance) { setErr("You must tick the legal compliance declaration."); return; }
    if (!addr.line1 || !addr.city || !addr.postcode) { setErr("Complete delivery address required."); return; }
    if (!user && !email.includes("@")) { setErr("Guest email required."); return; }
    setPlacing(true);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((c) => ({ variantId: c.variantId, quantity: c.quantity })), shippingAddress: addr, shippingMethod: method, promoCode: promo || undefined, guestEmail: user ? undefined : email, dob, complianceAccepted: compliance, cardLast4 }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Checkout failed"); setPlacing(false); return; }
      // Mock/sandbox: simulate customer completing payment → fire verified webhook
      const gateway = j.gateway || "mock";
      const secret = "wh_mock_secret";
      const w = await fetch(`/api/webhooks/payment?gateway=${gateway}&secret=${secret}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: j.orderId, intentId: j.paymentIntentId, status: "succeeded", cardLast4 }),
      });
      const wj = await w.json();
      if (!w.ok) { setErr(wj.error || "Payment verification failed"); setPlacing(false); return; }
      try { localStorage.removeItem("vs_promo"); } catch {}
      clearCart();
      router.push(`/order/${j.orderId}?paid=1`);
    } catch {
      setErr("Network error — try again.");
      setPlacing(false);
    }
  };

  if (cart.length === 0) return <div className="mx-auto max-w-2xl p-10 text-center"><p className="text-lg font-bold text-white">Your cart is empty</p><Link href="/shop" className="mt-3 inline-block rounded-xl bg-teal-500 px-6 py-3 text-sm font-bold text-white">Back to shop</Link></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-black text-white">Checkout</h1>
      <p className="text-xs text-zinc-400">Gateway: <b className="text-teal-300">mock (sandbox)</b> — switch via PAYMENT_GATEWAY env (authorize_net · nmi · square · viva)</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
            <h2 className="font-extrabold text-white">1 · Contact</h2>
            {user ? <p className="mt-2 text-sm text-zinc-300">Logged in as <b>{user.email}</b></p> : <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Guest email" className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" />}
            {!user && <p className="mt-1 text-xs text-zinc-500"><Link href="/login" className="text-teal-300 underline">Login</Link> for order history & saved addresses.</p>}
          </section>
          <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
            <h2 className="font-extrabold text-white">2 · Delivery address</h2>
            {saved.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {saved.map((a) => (
                  <button key={a.id} onClick={() => fetch("/api/addresses").then((r) => r.json()).then((j) => { const f = j.addresses.find((x: { id: string }) => x.id === a.id); if (f) setAddr({ fullName: f.fullName || "", line1: f.line1 || "", line2: f.line2 || "", city: f.city || "", postcode: f.postcode || "", country: f.country || "United Kingdom", phone: f.phone || "" }); })} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200">{a.label} · {a.line1}, {a.postcode}</button>
                ))}
              </div>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input value={addr.fullName} onChange={(e) => setAddr({ ...addr, fullName: e.target.value })} placeholder="Full name" className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" />
              <input value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} placeholder="Phone" className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" />
              <input value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} placeholder="Address line 1 *" className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none sm:col-span-2" />
              <input value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} placeholder="Line 2 (optional)" className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none sm:col-span-2" />
              <input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} placeholder="City *" className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" />
              <input value={addr.postcode} onChange={(e) => setAddr({ ...addr, postcode: e.target.value })} placeholder="Postcode *" className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" />
            </div>
            <h3 className="mt-4 font-bold text-white">Shipping method</h3>
            <p className="mt-1 text-[11px] text-zinc-500">Collect from {fullAddress} · <a className="underline text-teal-300" href={BRAND.mapsUrl} target="_blank" rel="noreferrer">directions</a> · {BRAND.phone}</p>
            <div className="mt-2 space-y-2">
              {[
                { id: "standard", label: `Standard (2–4 days) — ${subtotal - discount >= 50 ? "FREE" : gbp(3.99)}` },
                { id: "express", label: `Express next-day — ${gbp(7.99)}` },
                { id: "click_collect", label: `Click & Collect — FREE · ${BRAND.address.line1}, ${BRAND.address.postcode} (same day)` },
              ].map((m) => (
                <label key={m.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${method === m.id ? "border-teal-400 bg-teal-400/10" : "border-white/10"}`}>
                  <input type="radio" checked={method === m.id} onChange={() => setMethod(m.id)} className="accent-teal-400" />{m.label}
                </label>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
            <h2 className="font-extrabold text-white">3 · Age & legal compliance (required)</h2>
            <label className="mt-3 block text-xs font-bold text-zinc-300">DATE OF BIRTH *</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none sm:w-64" />
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300">
              <input type="checkbox" checked={compliance} onChange={(e) => setCompliance(e.target.checked)} className="mt-1 accent-teal-400" />
              <span>I confirm I am {process.env.NEXT_PUBLIC_AGE_THRESHOLD || 18}+, I understand this order contains nicotine which is addictive, I will provide valid photo ID on delivery/collection if asked, and I accept the store&apos;s age-verification policy.</span>
            </label>
          </section>
          <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
            <h2 className="font-extrabold text-white">4 · Payment (sandbox)</h2>
            <p className="mt-1 text-xs text-zinc-400">Mock card — no real charge. In production this embeds Authorize.Net Accept.js / NMI / Square / Viva checkout.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input defaultValue="4242 4242 4242 4242" disabled className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm opacity-60 sm:col-span-2" />
              <input value={cardLast4} onChange={(e) => setCardLast4(e.target.value)} placeholder="Last 4" maxLength={4} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" />
            </div>
          </section>
          {err && <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-300">{err}</p>}
        </div>
        <aside className="h-fit rounded-2xl border border-white/10 bg-zinc-900 p-5 lg:sticky lg:top-24">
          <h3 className="font-extrabold text-white">Order summary</h3>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {cart.map((c) => (
              <div key={c.variantId} className="flex justify-between gap-2 text-xs text-zinc-300"><span className="min-w-0">{c.quantity}× {c.name}<br /><span className="text-zinc-500">{c.variantLabel}</span></span><span className="shrink-0 font-bold text-white">{gbp(c.unitPrice * c.quantity)}</span></div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="Promo code" className="flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs outline-none" />
          </div>
          <div className="mt-3 space-y-1 text-sm text-zinc-300">
            <div className="flex justify-between"><span>Subtotal</span><span>{gbp(subtotal)}</span></div>
            <div className="flex justify-between text-emerald-400"><span>Discount</span><span>−{gbp(discount)}</span></div>
            <div className="flex justify-between"><span>Shipping</span><span>{gbp(shipCost)}</span></div>
            <div className="flex justify-between border-t border-white/10 pt-2 text-lg font-black text-white"><span>Total</span><span>{gbp(total)}</span></div>
          </div>
          <button onClick={place} disabled={placing} className="mt-4 w-full rounded-xl bg-teal-500 py-3 text-sm font-extrabold text-black hover:bg-teal-400 disabled:opacity-50">{placing ? "Processing payment…" : `Pay ${gbp(total)} →`}</button>
          <p className="mt-2 text-center text-[11px] text-zinc-500">Stock deducts only after webhook verifies payment.</p>
        </aside>
      </div>
    </div>
  );
}
