'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gbp } from '@/lib/format';
import { useStore } from '@/lib/store';
import { PlaceholderImage } from '@/components/placeholder-image';

type Cat = { id: number; name: string; slug: string };
type Variant = { id: string; sku: string; flavor?: string; nicotineStrength?: string; bottleSize?: string; color?: string | null; priceOverride?: string; stockQuantity: number };
type P = {
  id: string; name: string; brand: string; description: string;
  images: string[]; flavorProfile?: string | null;
  categorySlug?: string | null; categoryName?: string | null;
  minPrice: number; totalStock: number; inStock: boolean;
  variants: Variant[];
};

export function ShopClient({ categories, initialCategory, initialQ }: { categories: Cat[]; initialCategory: string; initialQ: string }) {
  const [products, setProducts] = useState<P[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(initialCategory);
  const [q, setQ] = useState(initialQ);
  const [brand, setBrand] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [sort, setSort] = useState<string>('name');
  const router = useRouter();
  const { addToCart } = useStore();

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (category) sp.set('category', category);
    if (q) sp.set('q', q);
    if (brand) sp.set('brand', brand);
    if (inStockOnly) sp.set('inStock', '1');
    if (maxPrice) sp.set('maxPrice', maxPrice);
    if (sort) sp.set('sort', sort);
    const res = await fetch('/api/products?' + sp.toString(), { cache: 'no-store' });
    const data = await res.json();
    setProducts((data.products || []) as P[]);
    setBrands(data.brands || []);
    setLoading(false);
    router.replace(`/shop?${sp.toString()}`, { scroll: false });
  }, [category, q, brand, inStockOnly, maxPrice, sort, router]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-3xl font-black text-slate-900">Shop</h1>
      <p className="text-slate-500 text-sm">Browse the full range. 18+ only. Click & Collect available.</p>
      <div className="grid md:grid-cols-[220px_1fr] gap-6 mt-6">
        <aside className="space-y-4">
          <div><label className="label">Search</label><input className="input rounded-xl" placeholder="e.g. Lost Mary" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div><label className="label">Category</label>
            <select className="input rounded-xl" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Brand</label>
            <select className="input rounded-xl" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div><label className="label">Max price (£)</label><input className="input rounded-xl" type="number" min="0" step="0.5" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} /></div>
          <div><label className="label">Sort by</label>
            <select className="input rounded-xl" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">Name</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} className="rounded bg-slate-100" />In stock only</label>
          <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-extrabold text-slate-900 hover:bg-slate-100 w-full" onClick={() => { setQ(''); setCategory(''); setBrand(''); setMaxPrice(''); setInStockOnly(false); }}>Clear filters</button>
        </aside>
        <div>
          {loading ? (
            <div className="text-slate-500 py-10 text-center">Loading products…</div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white text-center py-16 text-slate-500">No products match your filters.</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p) => {
                const top = [...p.variants].sort((a, b) => b.stockQuantity - a.stockQuantity)[0];
                return (
                  <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-[#90CAF9]/50 transition">
                    <Link href={`/product/${p.id}`}>
                      {p.images?.[0]
                        ? <PlaceholderImage src={p.images[0]} alt={p.name} className="h-44 w-full object-cover" />
                        : <div className="h-44 bg-gradient-to-br from-slate-100 to-slate-200 grid place-items-center text-5xl">☁️</div>}
                    </Link>
                    <div className="p-3">
                      <p className="text-[11px] font-bold uppercase text-slate-900">{p.brand} · {p.flavorProfile}</p>
                      <Link href={`/product/${p.id}`} className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-slate-900 hover:underline">{p.name}</Link>
                      <p className="mt-1 text-xs text-slate-500">{p.variants.length} options · {p.totalStock} in stock</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-extrabold text-slate-900">{gbp(p.minPrice)}</span>
                        <button
                          disabled={!top}
                          onClick={() => {
                            if (!top) return;
                            addToCart({
                              variantId: top.id, productId: p.id, name: p.name, brand: p.brand,
                              image: p.images?.[0],
                              variantLabel: [top.flavor, top.nicotineStrength, top.bottleSize].filter(Boolean).join(' · '),
                              sku: top.sku, unitPrice: parseFloat(top.priceOverride || '0'), stock: top.stockQuantity,
                            });
                          }}
                          className={`rounded-lg px-3 py-1.5 text-xs font-extrabold ${top ? 'bg-white border-2 border-[#64B5F6] text-[#64B5F6] hover:bg-[#64B5F6] hover:text-white' : 'bg-slate-100 text-slate-400'}`}
                        >+ Quick add</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
