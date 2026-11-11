'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gbp } from '@/lib/format';
import { useStore } from '@/lib/store';
import { PlaceholderImage } from '@/components/placeholder-image';

type Cat = { id: number; name: string; slug: string };
type Variant = {
  id: string; sku: string; flavor?: string; nicotineStrength?: string; bottleSize?: string;
  color?: string | null; priceOverride?: number | null; unitPrice: number; stockQuantity: number;
};
type P = {
  id: string; name: string; brand: string; description: string;
  images: string[]; flavorProfile?: string | null;
  categorySlug?: string | null; categoryName?: string | null;
  minPrice: number; totalStock: number; inStock: boolean;
  variants: Variant[];
};

const LOW_STOCK = 5;

export function ShopClient({ categories, initialCategory, initialQ }: { categories: Cat[]; initialCategory: string; initialQ: string }) {
  const [products, setProducts] = useState<P[]>([]);
  const [count, setCount] = useState(0);
  const [brands, setBrands] = useState<string[]>([]);
  const [strengths, setStrengths] = useState<string[]>([]);
  const [flavours, setFlavours] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(initialCategory);
  const [q, setQ] = useState(initialQ);
  const [brand, setBrand] = useState('');
  const [strength, setStrength] = useState('');
  const [flavour, setFlavour] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [sort, setSort] = useState<string>('name');
  const [added, setAdded] = useState<string | null>(null);
  const router = useRouter();
  const { addToCart } = useStore();
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const sp = new URLSearchParams();
    if (category) sp.set('category', category);
    if (q.trim()) sp.set('q', q.trim());
    if (brand) sp.set('brand', brand);
    if (strength) sp.set('strength', strength);
    if (flavour) sp.set('flavour', flavour);
    if (inStockOnly) sp.set('inStock', '1');
    if (maxPrice) sp.set('maxPrice', maxPrice);
    if (sort) sp.set('sort', sort);
    try {
      const res = await fetch('/api/products?' + sp.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      if (id !== reqId.current) return; // a newer search has started
      setProducts((data.products || []) as P[]);
      setCount(data.count ?? (data.products || []).length);
      setBrands(data.brands || []);
      setStrengths(data.strengths || []);
      setFlavours(data.flavours || []);
    } catch {
      if (id === reqId.current) setError('We could not load products. Check your connection and try again.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    router.replace(`/shop?${sp.toString()}`, { scroll: false });
  }, [category, q, brand, strength, flavour, inStockOnly, maxPrice, sort, router]);

  // Typing in search waits briefly so the list does not refresh on every key press.
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const clearAll = () => {
    setQ(''); setCategory(''); setBrand(''); setStrength(''); setFlavour(''); setMaxPrice(''); setInStockOnly(false);
  };
  const filtersOn = !!(q || category || brand || strength || flavour || maxPrice || inStockOnly);

  const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#64B5F6]';
  const lbl = 'block text-sm font-bold text-slate-800';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-3xl font-black text-slate-900">Shop</h1>
      <p className="text-slate-600 text-sm">Browse the full range. 18+ only. Click &amp; Collect available.</p>
      <div className="grid md:grid-cols-[240px_1fr] gap-6 mt-6">
        <form role="search" className="space-y-4" onSubmit={(e) => { e.preventDefault(); load(); }} aria-label="Filter products">
          <div>
            <label htmlFor="shop-q" className={lbl}>Search</label>
            <input id="shop-q" type="search" className={field} placeholder="e.g. mango 10mg, Lost Mary, SMOK" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="shop-category" className={lbl}>Category</label>
            <select id="shop-category" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="shop-brand" className={lbl}>Brand</label>
            <select id="shop-brand" className={field} value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="shop-flavour" className={lbl}>Flavour</label>
            <select id="shop-flavour" className={field} value={flavour} onChange={(e) => setFlavour(e.target.value)}>
              <option value="">All flavours</option>
              {flavours.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="shop-strength" className={lbl}>Nicotine strength</label>
            <select id="shop-strength" className={field} value={strength} onChange={(e) => setStrength(e.target.value)}>
              <option value="">Any strength</option>
              {strengths.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="shop-max" className={lbl}>Max price (£)</label>
            <input id="shop-max" type="number" inputMode="decimal" min="0" step="0.5" className={field} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          </div>
          <div>
            <label htmlFor="shop-sort" className={lbl}>Sort by</label>
            <select id="shop-sort" className={field} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">Name</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} className="h-4 w-4 rounded" />
            In stock only
          </label>
          <button type="button" disabled={!filtersOn} onClick={clearAll}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-900 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed">
            Clear filters
          </button>
        </form>

        <div>
          <p role="status" aria-live="polite" className="mb-3 text-sm text-slate-700">
            {loading ? 'Updating results…' : error ? '' : `${count} ${count === 1 ? 'product' : 'products'} found`}
          </p>
          {error && (
            <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 mb-4">{error}</div>
          )}
          {!loading && !error && products.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white text-center py-16 text-slate-700">
              <p>No products match these filters.</p>
              <button type="button" onClick={clearAll} className="mt-3 font-bold text-[#1565C0] underline">Clear filters and see everything</button>
            </div>
          ) : (
            <ul className="grid grid-cols-2 lg:grid-cols-3 gap-4" aria-busy={loading}>
              {products.map((p) => {
                const top = p.variants.find((v) => v.stockQuantity > 0);
                const left = top ? p.variants.reduce((s, v) => s + v.stockQuantity, 0) : 0;
                return (
                  <li key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-[#64B5F6] transition">
                    <Link href={`/product/${p.id}`} tabIndex={-1} aria-hidden="true">
                      {p.images?.[0]
                        ? <PlaceholderImage src={p.images[0]} alt="" className="h-44 w-full object-contain bg-white" />
                        : <div className="h-44 bg-gradient-to-br from-slate-100 to-slate-200 grid place-items-center text-5xl" aria-hidden="true">☁️</div>}
                    </Link>
                    <div className="p-3">
                      <p className="text-[11px] font-bold uppercase text-slate-700">{p.brand}{p.flavorProfile ? ` · ${p.flavorProfile}` : ''}</p>
                      <Link href={`/product/${p.id}`} className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-slate-900 hover:underline">{p.name}</Link>
                      <p className="mt-1 text-xs text-slate-700">
                        {p.variants.length} {p.variants.length === 1 ? 'option' : 'options'} ·{' '}
                        {!top ? <span className="font-bold text-red-800">Out of stock</span>
                          : left <= LOW_STOCK ? <span className="font-bold text-amber-800">Only {left} left</span>
                          : <span className="text-emerald-800">In stock</span>}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="font-extrabold text-slate-900">{p.variants.length > 1 ? 'From ' : ''}{gbp(p.minPrice)}</span>
                        {p.variants.length > 1 ? (
                          <Link href={`/product/${p.id}`} className="rounded-lg px-3 py-1.5 text-xs font-extrabold bg-white border-2 border-[#1976D2] text-[#1565C0] hover:bg-[#1976D2] hover:text-white">
                            {top ? 'Choose option' : 'See options'}
                          </Link>
                        ) : (
                        <button
                          type="button"
                          disabled={!top}
                          aria-label={top ? `Add ${p.name} to basket` : `${p.name} is out of stock`}
                          onClick={() => {
                            if (!top) return;
                            addToCart({
                              variantId: top.id, productId: p.id, name: p.name, brand: p.brand,
                              image: p.images?.[0],
                              variantLabel: [top.flavor, top.nicotineStrength, top.bottleSize].filter(Boolean).join(' · '),
                              sku: top.sku, unitPrice: top.unitPrice, stock: top.stockQuantity,
                            });
                            setAdded(p.name);
                            setTimeout(() => setAdded(null), 2000);
                          }}
                          className={`rounded-lg px-3 py-1.5 text-xs font-extrabold ${top ? 'bg-white border-2 border-[#1976D2] text-[#1565C0] hover:bg-[#1976D2] hover:text-white' : 'bg-slate-100 text-slate-600 cursor-not-allowed'}`}
                        >{top ? 'Quick add' : 'Sold out'}</button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {added && <p role="status" className="mt-3 text-sm font-bold text-slate-900">Added {added} to your basket.</p>}
        </div>
      </div>
    </div>
  );
}
