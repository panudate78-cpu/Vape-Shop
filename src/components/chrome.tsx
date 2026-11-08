"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useEffect, useState } from "react";
import { gbp } from "@/lib/format";
import { BRAND, fullAddress } from "@/lib/brand";

export function NicotineBanner() {
  return (
    <div className="bg-amber-400 text-black text-center text-[11px] sm:text-xs font-semibold tracking-wide px-3 py-1.5 uppercase">
      Warning: This product contains nicotine. Nicotine is an addictive substance — strictly 18+ only. · Dr Cloud Chessington — Challenge 25
    </div>
  );
}

export function AgeGate() {
  const { ageVerified, setAgeVerified } = useStore();
  const [dob, setDob] = useState("");
  const [err, setErr] = useState("");
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!ageVerified) {
      const t = setTimeout(() => setShow(true), 300);
      return () => clearTimeout(t);
    }
  }, [ageVerified]);
  if (ageVerified || !show) return null;
  const threshold = parseInt(process.env.NEXT_PUBLIC_AGE_THRESHOLD || "18", 10);
  const confirm = (withDob: boolean) => {
    if (withDob) {
      if (!dob) { setErr("Please enter your date of birth."); return; }
      const d = new Date(dob);
      const now = new Date();
      let age = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
      if (age < threshold) { setErr(`You must be ${threshold}+ to enter this store.`); return; }
    }
    setAgeVerified(true);
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-8 text-center shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/dr-cloud-logo.png" alt="Dr Cloud Chessington" className="mx-auto h-20 w-20 rounded-2xl object-cover" />
        <h2 className="mt-3 text-2xl font-extrabold text-white">Dr Cloud Chessington</h2>
        <p className="text-xs font-bold uppercase tracking-widest text-teal-300">{BRAND.tagline}</p>
        <p className="mt-2 text-sm text-zinc-400">You must be {threshold} or older to browse. Please confirm your age and enter your date of birth.</p>
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="mt-5 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-teal-400" max={new Date().toISOString().slice(0, 10)} />
        {err && <p className="mt-2 text-sm font-medium text-red-400">{err}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={() => (window.location.href = "https://www.google.com")} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5">Under {threshold}</button>
          <button onClick={() => confirm(true)} className="rounded-xl bg-teal-500 px-4 py-3 text-sm font-bold text-black hover:bg-teal-400">I&apos;m {threshold}+ — Enter</button>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">By entering you agree you are of legal smoking age in your country and understand nicotine is addictive. Visit us: {fullAddress}.</p>
      </div>
    </div>
  );
}

export function Header() {
  const { count, setCartOpen, user, refreshUser } = useStore();
  const [cats, setCats] = useState<{ name: string; slug: string }[]>([]);
  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((j) => setCats(j.categories || [])).catch(() => {});
  }, []);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await refreshUser();
    window.location.href = "/";
  };
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/90 backdrop-blur">
      {/* local store strip */}
      <div className="border-b border-white/5 bg-zinc-900/60 px-4 py-1.5 text-center text-[11px] font-medium text-zinc-400 sm:text-xs">
        📍 {fullAddress} · <a href={BRAND.phoneHref} className="font-bold text-teal-300 hover:underline">{BRAND.phone}</a> · Mon–Sat 9:30–6:30 ·{" "}
        <Link href="/visit" className="font-bold text-white underline underline-offset-2">Visit us / Click & Collect →</Link>
      </div>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/dr-cloud-logo.png" alt="Dr Cloud Chessington logo" className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/15" />
          <span className="leading-none">
            <span className="block text-lg font-extrabold tracking-tight text-white">
              Dr Cloud <span className="font-black text-teal-300">Chessington</span>
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Vape · Mobile · Bridge Road</span>
          </span>
        </Link>
        <nav className="ml-4 hidden items-center gap-4 text-sm font-medium text-zinc-300 lg:flex">
          <Link href="/shop" className="hover:text-white">Shop All</Link>
          {cats.slice(0, 5).map((c) => (
            <Link key={c.slug} href={`/shop?category=${c.slug}`} className="hover:text-white">{c.name}</Link>
          ))}
          <Link href="/visit" className="hover:text-white">Visit Us</Link>
          <Link href="/track" className="hover:text-white">Track Order</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              {user.role === "ADMIN" && <Link href="/admin" className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-extrabold text-black hover:bg-amber-300">ADMIN</Link>}
              <Link href="/account" className="hidden rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/5 sm:block">{user.email}</Link>
              <button onClick={logout} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white">Logout</button>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/5">Login</Link>
              <Link href="/register" className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-teal-400">Join</Link>
            </>
          )}
          <button onClick={() => setCartOpen(true)} className="relative rounded-xl bg-white px-3.5 py-2 text-sm font-extrabold text-black hover:bg-zinc-200">
            🛒 Cart
            {count > 0 && <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-teal-500 text-[11px] font-black text-black">{count}</span>}
          </button>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto border-t border-white/5 px-4 py-2 text-xs font-semibold text-zinc-400 lg:hidden">
        <Link href="/shop" className="shrink-0">Shop All</Link>
        {cats.map((c) => <Link key={c.slug} className="shrink-0" href={`/shop?category=${c.slug}`}>{c.name}</Link>)}
        <Link href="/visit" className="shrink-0 text-teal-300">Visit Us</Link>
      </div>
    </header>
  );
}

export function CartDrawer() {
  const { cart, cartOpen, setCartOpen, updateQty, removeLine, subtotal } = useStore();
  const [promo, setPromo] = useState("");
  const [discount, setDiscount] = useState(0);
  const [promoMsg, setPromoMsg] = useState("");
  if (!cartOpen) return null;
  const applyPromo = async () => {
    setPromoMsg("Checking…");
    try {
      const r = await fetch("/api/promos/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promo, subtotal }) });
      const j = await r.json();
      if (!r.ok) { setPromoMsg(j.error); setDiscount(0); return; }
      setDiscount(j.promo.discount);
      setPromoMsg(`Applied ${j.promo.code}: −${gbp(j.promo.discount)}`);
      try { localStorage.setItem("vs_promo", promo.toUpperCase()); } catch {}
    } catch { setPromoMsg("Failed"); }
  };
  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/60" onClick={() => setCartOpen(false)} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-zinc-950 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h3 className="text-lg font-extrabold">Your Cart ({cart.length})</h3>
          <button onClick={() => setCartOpen(false)} className="rounded-lg border border-white/10 px-3 py-1 text-sm">Close</button>
        </div>
        <div className="border-b border-white/5 bg-teal-500/10 px-4 py-2 text-[11px] font-medium text-teal-200">
          Free Click & Collect from {fullAddress} — ready same day.
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 && <p className="text-sm text-zinc-400">Your cart is empty. <Link href="/shop" onClick={() => setCartOpen(false)} className="text-teal-300 underline">Browse the shop →</Link></p>}
          {cart.map((l) => (
            <div key={l.variantId} className="flex gap-3 rounded-xl border border-white/10 bg-zinc-900 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {l.image ? <img src={l.image} alt={l.name} className="h-16 w-16 rounded-lg object-cover" /> : <div className="h-16 w-16 rounded-lg bg-zinc-800" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{l.name}</p>
                <p className="truncate text-xs text-zinc-400">{l.variantLabel} · {l.sku}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => updateQty(l.variantId, l.quantity - 1)} className="rounded border border-white/15 px-2">−</button>
                  <span className="text-sm font-bold">{l.quantity}</span>
                  <button onClick={() => updateQty(l.variantId, l.quantity + 1)} className="rounded border border-white/15 px-2">+</button>
                  <span className="ml-auto text-sm font-extrabold">{gbp(l.unitPrice * l.quantity)}</span>
                </div>
              </div>
              <button onClick={() => removeLine(l.variantId)} className="text-zinc-500 hover:text-red-400">✕</button>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 p-4 space-y-3">
          <div className="flex gap-2">
            <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Promo code (try WELCOME10)" className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm outline-none" />
            <button onClick={applyPromo} className="rounded-lg border border-teal-400 px-3 py-2 text-sm font-bold text-teal-300">Apply</button>
          </div>
          {promoMsg && <p className="text-xs text-zinc-400">{promoMsg}</p>}
          <div className="flex justify-between text-sm text-zinc-300"><span>Subtotal</span><span className="font-bold text-white">{gbp(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between text-sm text-emerald-400"><span>Promo</span><span>−{gbp(discount)}</span></div>}
          <Link href="/checkout" onClick={() => setCartOpen(false)} className="block rounded-xl bg-teal-500 py-3 text-center font-extrabold text-black hover:bg-teal-400">Checkout →</Link>
          <p className="text-center text-[11px] text-zinc-500">18+ only · ID may be required on collection/delivery</p>
        </div>
      </aside>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950 px-4 py-10 text-sm text-zinc-400">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/dr-cloud-logo.png" alt="Dr Cloud Chessington" className="h-9 w-9 rounded-lg object-cover" />
            <p className="text-lg font-extrabold text-white">Dr Cloud <span className="text-teal-300">Chessington</span></p>
          </div>
          <p className="mt-2 text-xs leading-relaxed">Chessington&apos;s local vape & mobile store. Challenge 25 in store & online. We verify age on every nicotine order. Phone repairs while you wait.</p>
          <a href={BRAND.mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-teal-300 underline">Get directions →</a>
        </div>
        <div>
          <p className="font-bold text-white">Shop</p>
          <ul className="mt-2 space-y-1 text-xs">
            <li><Link href="/shop?category=e-liquids">E-Liquids</Link></li>
            <li><Link href="/shop?category=pod-systems">Pod Systems</Link></li>
            <li><Link href="/shop?category=mods-kits">Mods & Kits</Link></li>
            <li><Link href="/shop?category=coils-tanks">Coils & Tanks</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-bold text-white">Visit us</p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>{BRAND.address.line1}</li>
            <li>{BRAND.address.town}, {BRAND.address.county} {BRAND.address.postcode}</li>
            <li><a href={BRAND.phoneHref} className="font-bold text-white">{BRAND.phone}</a></li>
            <li>Mon–Sat 9:30am–6:30pm · Sun 10am–4pm</li>
            <li><Link href="/visit" className="text-teal-300 underline">Store info & map</Link></li>
            <li><Link href="/track" className="underline">Track Order</Link> · <Link href="/account" className="underline">My Account</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-bold text-white">Compliance</p>
          <p className="mt-2 text-[11px] leading-relaxed">Warning: This product contains nicotine which is a highly addictive substance. Not for sale to under-18s. Keep out of reach of children. Admin: {process.env.NEXT_PUBLIC_ADMIN_HINT || "admin@vapeshop.co.uk / Admin123!"}</p>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-7xl border-t border-white/5 pt-4 text-center text-[11px] text-zinc-500">© {new Date().getFullYear()} {BRAND.fullName} · {fullAddress} · {BRAND.phone}</p>
    </footer>
  );
}
