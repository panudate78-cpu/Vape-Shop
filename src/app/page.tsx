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

export default function Home() {
  const [products, setProducts] = useState<P[]>([]);
  const [seeding, setSeeding] = useState(false);
  const { addToCart, setCartOpen } = useStore();

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
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-950 via-zinc-950 to-emerald-950" />
        <PlaceholderImage src="/images/chessington-shop.svg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-teal-500/25 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-400/10 px-3 py-1 text-xs font-bold text-teal-200">
              📍 {fullAddress} · <a href={BRAND.phoneHref} className="underline">{BRAND.phone}</a>
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] text-white md:text-6xl">
              Dr Cloud<br />Chessington<br />
              <span className="bg-gradient-to-r from-teal-300 to-emerald-300 bg-clip-text text-transparent">Vape & Mobile Store.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-300 md:text-base">
              Your local Bridge Road vape shop — shortfills, nic salts, pods & mods, plus phone repairs while you wait.
              Order online for <b className="text-white">same-day Click & Collect</b> or local delivery. Every order age-verified.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/shop" className="rounded-xl bg-teal-500 px-6 py-3 text-sm font-extrabold text-black hover:bg-teal-400">Shop E-Liquids →</Link>
              <Link href="/visit" className="rounded-xl border border-white/15 px-6 py-3 text-sm font-extrabold text-white hover:bg-white/5">Visit the shop</Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-300">
              <span>★ 5.0 local reviews</span><span>⚡ Same-day Collect</span><span>🛡 18+ verified</span><span>📱 Repairs in-store</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-400">
              <span className="rounded-full bg-white/5 px-3 py-1">Mon–Sat 9:30–6:30</span>
              <span className="rounded-full bg-white/5 px-3 py-1">Sun 10–4</span>
              <span className="rounded-full bg-white/5 px-3 py-1">Free Collect</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {featured.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/80 hover:border-teal-400/40 transition">
                {p.images?.[0] ? (
                  <PlaceholderImage src={p.images[0]} alt={p.name} className="h-36 w-full object-cover md:h-44" />
                ) : (
                  <div className="h-36 w-full md:h-44 bg-gradient-to-br from-teal-900/50 to-zinc-900 grid place-items-center text-4xl">☁️</div>
                )}
                <div className="p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-teal-300">{p.brand}</p>
                  <Link href={`/product/${p.id}`} className="line-clamp-1 text-sm font-bold text-white hover:underline">{p.name}</Link>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm font-extrabold text-white">{gbp(p.minPrice)}</span>
                    <Link href={`/product/${p.id}`} className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold hover:bg-white/20">View</Link>
                  </div>
                </div>
              </div>
            ))}
            {seeding && <p className="col-span-2 text-center text-sm text-zinc-400">Seeding demo catalogue…</p>}
            {!seeding && featured.length === 0 && (
              <p className="col-span-2 text-center text-sm text-zinc-400 py-8">Loading catalogue…</p>
            )}
          </div>
        </div>
      </section>

      {/* VISIT STRIP */}
      <section className="border-y border-white/10 bg-zinc-900/60">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <div className="text-sm">
            <p className="font-extrabold text-white">Pop in — {BRAND.fullName}, {fullAddress}</p>
            <p className="text-xs text-zinc-400">Click & Collect ready same day · Call <a className="font-bold text-teal-300" href={BRAND.phoneHref}>{BRAND.phone}</a> for stock & repair quotes · <a className="underline" href={BRAND.mapsUrl} target="_blank" rel="noreferrer">Get directions</a></p>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Link href="/visit" className="rounded-xl border border-white/15 px-4 py-2 text-xs font-extrabold text-white">Store info</Link>
            <Link href="/shop" className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-black">Order for collection →</Link>
          </div>
        </div>
      </section>

      {/* CATEGORY TILES */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="text-xl font-extrabold text-white">Shop by category</h2>
        <p className="text-xs text-zinc-400">In stock on Bridge Road today — reserve online, collect in minutes.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { slug: "e-liquids", emoji: "🧴", blurb: "Shortfills & salts" },
            { slug: "pod-systems", emoji: "🔋", blurb: "Pod kits & starters" },
            { slug: "mods-kits", emoji: "⚡", blurb: "Mods & sub-ohm kits" },
            { slug: "coils-tanks", emoji: "🌀", blurb: "Coils & tanks" },
            { slug: "accessories", emoji: "🎒", blurb: "Batteries, chargers & gear" },
          ].map((c) => (
            <Link key={c.slug} href={`/shop?category=${c.slug}`} className="rounded-2xl border border-white/10 bg-zinc-900 p-5 hover:border-teal-400/60 hover:bg-zinc-800 transition">
              <div className="text-3xl">{c.emoji}</div>
              <p className="mt-2 text-sm font-extrabold text-white capitalize">{c.slug.replace("-", " ")}</p>
              <p className="text-xs text-zinc-400">{c.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ALL PRODUCTS */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-extrabold text-white">Bestsellers in Chessington</h2>
          <Link href="/shop" className="text-sm font-bold text-teal-300">View all →</Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.slice(0, 8).map((p) => (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 hover:border-teal-400/40 transition">
              <Link href={`/product/${p.id}`}>
                {p.images?.[0] ? (
                  <PlaceholderImage src={p.images[0]} alt={p.name} className="h-44 w-full object-cover" />
                ) : (
                  <div className="h-44 bg-gradient-to-br from-teal-900/40 to-zinc-800 grid place-items-center text-5xl">☁️</div>
                )}
              </Link>
              <div className="p-3">
                <p className="text-[11px] font-bold uppercase text-teal-300">{p.brand} · {p.flavorProfile}</p>
                <Link href={`/product/${p.id}`} className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-white hover:underline">{p.name}</Link>
                <p className="mt-1 text-xs text-zinc-400">{p.variants.length} options · {p.totalStock} in stock</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-extrabold text-white">from {gbp(p.minPrice)}</span>
                  <button
                    onClick={() => {
                      // Pick the variant with the most stock as default "quick add"
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
                    }}
                    className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-extrabold text-black hover:bg-teal-400"
                  >+ Quick add</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-3 rounded-2xl border border-white/10 bg-zinc-900 p-6 md:grid-cols-3">
          <div><p className="font-extrabold text-white">🏪 Local & trusted</p><p className="mt-1 text-xs text-zinc-400">{fullAddress}. Call {BRAND.phone} — real advice from your neighbourhood vape & phone store.</p></div>
          <div><p className="font-extrabold text-white">⚡ Click & Collect</p><p className="mt-1 text-xs text-zinc-400">Order online, pick up same day on Bridge Road. Free, no minimum. ID checked on collection (18+).</p></div>
          <div><p className="font-extrabold text-white">🔞 Challenge 25</p><p className="mt-1 text-xs text-zinc-400">Age gate on entry, DOB + declaration at checkout, ID on delivery & collection.</p></div>
        </div>
      </section>
    </div>
  );
}
