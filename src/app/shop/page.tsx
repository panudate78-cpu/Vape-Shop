"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { gbp, NICOTINE_STRENGTHS, BOTTLE_SIZES, FLAVOR_PROFILES, VG_PG } from "@/lib/format";

type P = {
  id: string; name: string; brand: string; basePrice: string; images: string[];
  categorySlug?: string | null; flavorProfile?: string | null; vgPgRatio?: string | null;
  minPrice: number; totalStock: number;
  variants: { nicotineStrength?: string | null; bottleSize?: string | null }[];
};

function ShopInner() {
  const sp = useSearchParams();
  const [products, setProducts] = useState<P[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [cats, setCats] = useState<{ name: string; slug: string }[]>([]);
  const [q, setQ] = useState(sp.get("q") || "");
  const [category, setCategory] = useState(sp.get("category") || "");
  const [brand, setBrand] = useState("");
  const [flavorProfile, setFlavorProfile] = useState("");
  const [nicotine, setNicotine] = useState("");
  const [bottleSize, setBottleSize] = useState("");
  const [vgpg, setVgpg] = useState("");
  const [maxPrice, setMaxPrice] = useState("40");
  const [sort, setSort] = useState("featured");

  useEffect(() => { setCategory(sp.get("category") || ""); }, [sp]);

  const fetchProducts = async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (brand) params.set("brand", brand);
    if (flavorProfile) params.set("flavorProfile", flavorProfile);
    if (nicotine) params.set("nicotine", nicotine);
    if (bottleSize) params.set("bottleSize", bottleSize);
    if (vgpg) params.set("vgpg", vgpg);
    if (maxPrice) params.set("maxPrice", maxPrice);
    const r = await fetch(`/api/products?${params.toString()}`);
    const j = await r.json();
    setProducts(j.products || []);
    setBrands(j.brands || []);
  };

  useEffect(() => { fetch("/api/categories").then((r) => r.json()).then((j) => setCats(j.categories || [])); }, []);
  useEffect(() => { const t = setTimeout(fetchProducts, 250); return () => clearTimeout(t); }, [q, category, brand, flavorProfile, nicotine, bottleSize, vgpg, maxPrice]);

  const sorted = useMemo(() => {
    const arr = [...products];
    if (sort === "price-asc") arr.sort((a, b) => a.minPrice - b.minPrice);
    if (sort === "price-desc") arr.sort((a, b) => b.minPrice - a.minPrice);
    if (sort === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [products, sort]);

  const clearAll = () => { setQ(""); setCategory(""); setBrand(""); setFlavorProfile(""); setNicotine(""); setBottleSize(""); setVgpg(""); setMaxPrice("40"); };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-black text-white">Shop all products</h1>
      <p className="text-sm text-zinc-400">{sorted.length} result{sorted.length === 1 ? "" : "s"} · 18+ only</p>
      <div className="mt-4 flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 space-y-5 rounded-2xl border border-white/10 bg-zinc-900 p-5 lg:w-64">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-400">Search</p>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mango, Nebula, coil…" className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-teal-400" />
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-400">Category</p>
            <div className="mt-2 space-y-1">
              <button onClick={() => setCategory("")} className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${!category ? "bg-teal-500 text-black" : "text-zinc-300 hover:bg-white/5"}`}>All</button>
              {cats.map((c) => (
                <button key={c.slug} onClick={() => setCategory(c.slug)} className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${category === c.slug ? "bg-teal-500 text-black" : "text-zinc-300 hover:bg-white/5"}`}>{c.name}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-400">Brand</p>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm">
              <option value="">All brands</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-400">Flavour profile</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FLAVOR_PROFILES.map((f) => (
                <button key={f} onClick={() => setFlavorProfile(flavorProfile === f ? "" : f)} className={`rounded-full px-3 py-1 text-xs font-bold ${flavorProfile === f ? "bg-teal-500 text-black" : "bg-white/5 text-zinc-300"}`}>{f}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-400">Nicotine strength</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {NICOTINE_STRENGTHS.map((n) => (
                <button key={n} onClick={() => setNicotine(nicotine === n ? "" : n)} className={`rounded-full px-3 py-1 text-xs font-bold ${nicotine === n ? "bg-teal-500 text-black" : "bg-white/5 text-zinc-300"}`}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-400">Bottle size</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BOTTLE_SIZES.map((s) => (
                <button key={s} onClick={() => setBottleSize(bottleSize === s ? "" : s)} className={`rounded-full px-3 py-1 text-xs font-bold ${bottleSize === s ? "bg-teal-500 text-black" : "bg-white/5 text-zinc-300"}`}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-400">VG/PG</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VG_PG.map((v) => (
                <button key={v} onClick={() => setVgpg(vgpg === v ? "" : v)} className={`rounded-full px-3 py-1 text-xs font-bold ${vgpg === v ? "bg-teal-500 text-black" : "bg-white/5 text-zinc-300"}`}>{v}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-400">Max price: {gbp(parseFloat(maxPrice))}</p>
            <input type="range" min={5} max={80} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="mt-2 w-full accent-teal-400" />
          </div>
          <button onClick={clearAll} className="w-full rounded-lg border border-white/10 py-2 text-xs font-bold text-zinc-300 hover:bg-white/5">Clear filters</button>
        </aside>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">Tip: promo <b className="text-teal-300">WELCOME10</b> = 10% off</p>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs">
              <option value="featured">Featured</option>
              <option value="price-asc">Price ↑</option>
              <option value="price-desc">Price ↓</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-3">
            {sorted.map((p) => (
              <Link key={p.id} href={`/product/${p.id}`} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 hover:border-teal-400/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="h-44 w-full object-cover" /> : <div className="h-44 bg-zinc-800" />}
                <div className="p-3">
                  <p className="text-[11px] font-bold uppercase text-teal-300">{p.brand}</p>
                  <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-white">{p.name}</p>
                  <p className="mt-1 text-[11px] text-zinc-400">{p.flavorProfile} · {p.vgPgRatio} · {p.totalStock} in stock</p>
                  <p className="mt-1 text-sm font-extrabold text-white">from {gbp(p.minPrice)}</p>
                </div>
              </Link>
            ))}
          </div>
          {sorted.length === 0 && <p className="mt-10 text-center text-sm text-zinc-400">No products match — try clearing filters.</p>}
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return <Suspense fallback={<div className="p-10 text-center text-zinc-400">Loading shop…</div>}><ShopInner /></Suspense>;
}
