'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { gbp, variantLabel as makeLabel } from '@/lib/format';
import { useStore } from '@/lib/store';
import { PlaceholderImage } from '@/components/placeholder-image';

type Variant = {
  id: string; flavor: string; nicotineStrength: string; bottleSize: string; color?: string | null;
  price: number; stockQuantity: number; sku: string;
};
type Product = {
  id: string; name: string; brand: string; description: string; images: string[];
  vgPgRatio: string; flavorProfile: string; tags: string[];
  categoryName: string | null;
};

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { addToCart } = useStore();

  useEffect(() => {
    fetch(`/api/products/${params.id}`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (!d.product) { setLoading(false); return; }
      setProduct({ ...d.product, images: d.product.images || [] });
      const vs = (d.variants || []).map((v: any) => ({
        id: String(v.id),
        flavor: v.flavor || '',
        nicotineStrength: v.nicotineStrength || '0mg',
        bottleSize: v.bottleSize || '10ml',
        color: v.color || null,
        price: Number(v.price),
        stockQuantity: v.stockQuantity,
        sku: v.sku,
      }));
      setVariants(vs);
      const inStock = vs.find((v: Variant) => v.stockQuantity > 0);
      setSel(inStock ? inStock.id : (vs[0]?.id ?? null));
      setLoading(false);
    });
  }, [params.id]);

  if (loading) return <div className="text-slate-500 py-10 text-center">Loading…</div>;
  if (!product) return <div className="rounded-2xl border border-slate-200 bg-white text-center py-16">Product not found.</div>;
  const v = variants.find((x) => x.id === sel) || null;

  return (
    <div className="mx-auto max-w-6xl grid md:grid-cols-2 gap-8 py-6 px-4">
      <div className="aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-zinc-800 to-zinc-900 grid place-items-center">
        {product.images?.[0] ? <PlaceholderImage src={product.images[0]} alt={product.name} className="h-full w-full object-cover" /> : <span className="text-7xl">☁️</span>}
      </div>
      <div>
        <div className="text-xs text-teal-400 uppercase tracking-wide font-bold">{product.brand}{product.categoryName ? ' · ' + product.categoryName : ''}</div>
        <h1 className="text-3xl md:text-4xl font-black mt-1 text-slate-900 leading-tight">{product.name}</h1>
        <p className="text-slate-700 mt-3">{product.description}</p>
        <div className="mt-3 text-sm text-slate-500 space-y-1">
          {product.vgPgRatio && <div>VG/PG: {product.vgPgRatio}</div>}
          {product.flavorProfile && <div>Profile: {product.flavorProfile}</div>}
        </div>
        <div className="mt-4 text-4xl font-black text-teal-400">
          {v ? gbp(v.price) : gbp(Math.min(...variants.map((x) => x.price)))}
        </div>
        <div className="mt-5">
          <div className="label text-slate-700 font-bold mb-2">Choose option</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {variants.map((vv) => {
              const lbl = [vv.flavor, vv.nicotineStrength, vv.bottleSize].filter(Boolean).join(' · ');
              const active = sel === vv.id;
              const out = vv.stockQuantity === 0;
              return (
                <button key={vv.id} onClick={() => setSel(vv.id)} disabled={out}
                  className={`text-left rounded-xl border p-3 text-sm transition ${active ? 'border-teal-400 bg-teal-500/10' : 'border-slate-200 hover:border-white/30'} ${out ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <div className="flex items-center gap-2">
                    {vv.color && /^#([0-9a-f]{3}){1,2}$/i.test(vv.color) && (
                      <span className="h-4 w-4 rounded-full border border-slate-300" style={{ background: vv.color }} />
                    )}
                    <span className="font-bold text-slate-900">{lbl}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {gbp(vv.price)} · {out ? 'Out of stock' : `${vv.stockQuantity} in stock`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-6">
          <button
            disabled={!v || v.stockQuantity === 0}
            onClick={() => {
              if (!v) return;
              addToCart({
                variantId: v.id, productId: product.id, name: product.name, brand: product.brand,
                image: product.images?.[0],
                variantLabel: makeLabel(v), sku: v.sku,
                unitPrice: v.price, stock: v.stockQuantity,
              });
            }}
            className={`w-full rounded-xl px-6 py-3 text-sm font-extrabold ${v && v.stockQuantity > 0 ? 'bg-teal-600 text-white hover:bg-teal-400' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
          >
            {v && v.stockQuantity > 0 ? 'Add to cart' : 'Out of stock'}
          </button>
          <p className="text-xs text-slate-400 mt-3">⚠️ Nicotine is addictive. Adults 18+ only. Challenge 25 on collection/delivery.</p>
        </div>
      </div>
    </div>
  );
}
