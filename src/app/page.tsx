"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { gbp } from "@/lib/format";
import { useStore } from "@/lib/store";
import { BRAND, fullAddress } from "@/lib/brand";
import { PlaceholderImage } from "@/components/placeholder-image";

type P = {
  id: string; name: string; brand: string; basePrice: string; images: string[];
  categorySlug?: string | null; categoryName?: string | null;
  flavorProfile?: string | null; minPrice: number; totalStock: number;
  variants: { id: string; sku: string; flavor?: string | null; nicotineStrength?: string | null; bottleSize?: string | null; color?: string | null; priceOverride?: string | null; stockQuantity: number }[];
};

function ProductCard({ p, onAdd }: { p: P; onAdd: (p: P) => void }) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-[#BBDEFB] hover:shadow-md transition">
      <Link href={`/product/${p.id}`}>
        {p.images?.[0] ? (
          <PlaceholderImage src={p.images[0]} alt={p.name} className="h-44 w-full object-cover bg-slate-100" />
        ) : (
          <div className="h-44 bg-gradient-to-br from-slate-500 to-slate-100 grid place-items-center text-5xl">☁️</div>
        )}
      </Link>
      <div className="p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-900">{p.brand} · {p.flavorProfile}</p>
        <Link href={`/product/${p.id}`} className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-slate-900 hover:text-slate-900">{p.name}</Link>
        <p className="mt-1 text-xs text-slate-500">{p.variants.length} options · {p.totalStock} in stock</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-extrabold text-slate-900">from {gbp(p.minPrice)}</span>
          <button onClick={() => onAdd(p)} className="rounded-lg bg-white border-2 border-[#64B5F6] text-[#64B5F6] hover:bg-[#64B5F6] hover:text-white px-3 py-1.5 text-xs font-bold transition shadow-sm">+ Quick add</button>
        </div>
      </div>
    </div>
  );
}

function quickAdd(p: P, addToCart: (i: any) => void) {
  const v = [...p.variants].sort((a, b) => b.stockQuantity - a.stockQuantity)[0];
  if (!v) return;
  addToCart({
    variantId: v.id, productId: p.id, name: p.name, brand: p.brand,
    image: p.images?.[0],
    variantLabel: [v.flavor, v.nicotineStrength, v.bottleSize].filter(Boolean).join(" · "),
    sku: v.sku,
    unitPrice: parseFloat(v.priceOverride || p.basePrice),
    stock: v.stockQuantity,
  });
}

export default function Home() {
  const [products, setProducts] = useState<P[]>([]);
  const [seeding, setSeeding] = useState(false);
  const { addToCart } = useStore();

  const load = async () => {
    const r = await fetch("/api/products", { cache: "no-store" });
    const j = await r.json();
    setProducts(j.products || []);
  };
  useEffect(() => {
    load().then(async () => {
      const r = await fetch("/api/products", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (r && (r.products || []).length === 0) {
        setSeeding(true);
        await fetch("/api/seed", { method: "POST" }).catch(() => {});
        setSeeding(false);
        load();
      }
    });
  }, []);

  const featured = products.slice(0, 4);

  return (
    <div>
      {/* HERO — blue brand colour */}
      <section className="relative overflow-hidden bg-[#64B5F6] text-white">
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20 items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1 text-xs font-bold text-white">
              📍 {fullAddress} · <a href={BRAND.phoneHref} className="underline hover:text-white/80">{BRAND.phone}</a>
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] md:text-6xl text-white">
              Dr Cloud<br />Chessington<br />
              <span className="text-white/85">Vape & Mobile Store.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/90 md:text-base">
              Your local Bridge Road vape shop — shortfills, nic salts, pods & mods, plus phone repairs while you wait.
              Order online for <b>same-day Click & Collect</b> or local delivery. Every order age-verified.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/shop" className="rounded-xl bg-white px-6 py-3 text-sm font-extrabold text-[#64B5F6] hover:bg-white/90 transition shadow-sm">Shop E-Liquids →</Link>
              <Link href="/visit" className="rounded-xl border-2 border-white px-6 py-3 text-sm font-extrabold text-white hover:bg-white hover:text-[#64B5F6] transition">Visit the shop</Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/80">
              <span>★ 5.0 local reviews</span><span>⚡ Same-day Collect</span><span>🛡 18+ verified</span><span>📱 Repairs in-store</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-900">
              <span className="rounded-full bg-white px-3 py-1 font-semibold">Mon–Sat 9:30–6:30</span>
              <span className="rounded-full bg-white px-3 py-1 font-semibold">Sun 10–4</span>
              <span className="rounded-full bg-white px-3 py-1 font-semibold">Free Collect</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {featured.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-2xl bg-white text-slate-900 shadow-lg hover:shadow-xl transition">
                {p.images?.[0] ? (
                  <PlaceholderImage src={p.images[0]} alt={p.name} className="h-36 w-full object-cover md:h-44 bg-slate-100" />
                ) : (
                  <div className="h-36 w-full md:h-44 bg-slate-50 grid place-items-center text-4xl">☁️</div>
                )}
                <div className="p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-900">{p.brand}</p>
                  <Link href={`/product/${p.id}`} className="line-clamp-1 text-sm font-bold text-slate-900 hover:text-slate-900">{p.name}</Link>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm font-extrabold text-slate-900">{gbp(p.minPrice)}</span>
                    <Link href={`/product/${p.id}`} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">View</Link>
                  </div>
                </div>
              </div>
            ))}
            {seeding && <p className="col-span-2 text-center text-sm text-white/70">Seeding demo catalogue…</p>}
            {!seeding && featured.length === 0 && (
              <p className="col-span-2 text-center text-sm text-white/70 py-8">Loading catalogue…</p>
            )}
          </div>
        </div>
      </section>

      {/* VISIT STRIP */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <div className="text-sm">
            <p className="font-extrabold text-slate-900">Pop in — {BRAND.fullName}, {fullAddress}</p>
            <p className="text-xs text-slate-500">Click & Collect ready same day · Call <a className="font-bold text-slate-900" href={BRAND.phoneHref}>{BRAND.phone}</a> for stock & repair quotes · <a className="underline text-slate-900 hover:text-black" href={BRAND.mapsUrl} target="_blank" rel="noreferrer">Get directions</a></p>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Link href="/visit" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50 transition">Store info</Link>
            <Link href="/shop" className="rounded-xl bg-white border-2 border-[#64B5F6] text-[#64B5F6] px-4 py-2 text-xs font-extrabold hover:bg-[#4FA3E8] transition shadow-sm">Order for collection →</Link>
          </div>
        </div>
      </section>

      {/* CATEGORY TILES */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="text-xl font-extrabold text-slate-900">Shop by category</h2>
        <p className="text-xs text-slate-500">In stock on Bridge Road today — reserve online, collect in minutes.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { slug: "e-liquids", emoji: "🧴", blurb: "Shortfills & salts" },
            { slug: "pod-systems", emoji: "🔋", blurb: "Pod kits & starters" },
            { slug: "mods-kits", emoji: "⚡", blurb: "Mods & sub-ohm kits" },
            { slug: "coils-tanks", emoji: "🌀", blurb: "Coils & tanks" },
            { slug: "accessories", emoji: "🎒", blurb: "Batteries, chargers & gear" },
          ].map((c) => (
            <Link key={c.slug} href={`/shop?category=${c.slug}`} className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-[#BBDEFB] hover:shadow-sm transition">
              <div className="text-3xl">{c.emoji}</div>
              <p className="mt-2 text-sm font-extrabold text-slate-900 capitalize">{c.slug.replace("-", " ")}</p>
              <p className="text-xs text-slate-500">{c.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ALL PRODUCTS */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-extrabold text-slate-900">Bestsellers in Chessington</h2>
          <Link href="/shop" className="text-sm font-bold text-slate-900 hover:text-black">View all →</Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.slice(0, 8).map((p) => (<ProductCard key={p.id} p={p} onAdd={(pp) => quickAdd(pp, addToCart)} />))}
        </div>

        <div className="mt-10 grid gap-3 rounded-2xl border border-slate-200 bg-white p-6 md:grid-cols-3 shadow-sm">
          <div><p className="font-extrabold text-slate-900">🏪 Local & trusted</p><p className="mt-1 text-xs text-slate-500">{fullAddress}. Call {BRAND.phone} — real advice from your neighbourhood vape & phone store.</p></div>
          <div><p className="font-extrabold text-slate-900">⚡ Click & Collect</p><p className="mt-1 text-xs text-slate-500">Order online, pick up same day on Bridge Road. Free, no minimum. ID checked on collection (18+).</p></div>
          <div><p className="font-extrabold text-slate-900">🔞 Challenge 25</p><p className="mt-1 text-xs text-slate-500">Age gate on entry, DOB + declaration at checkout, ID on delivery & collection.</p></div>
        </div>
      </section>
    </div>
  );
}
