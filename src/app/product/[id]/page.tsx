"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { gbp, variantLabel } from "@/lib/format";
import { useStore } from "@/lib/store";

type Variant = {
  id: string; sku: string; flavor?: string | null; nicotineStrength?: string | null;
  bottleSize?: string | null; color?: string | null; priceOverride?: string | null;
  stockQuantity: number; lowStockThreshold: number;
};
type Product = {
  id: string; name: string; brand: string; description: string; basePrice: string;
  vgPgRatio?: string | null; flavorProfile?: string | null; images: string[]; tags: string[];
  variants: Variant[]; category?: { name: string; slug: string } | null;
};

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<Product | null>(null);
  const [sel, setSel] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [related, setRelated] = useState<Product[]>([]);
  const { addToCart } = useStore();

  useEffect(() => {
    fetch(`/api/products/${id}`).then((r) => r.json()).then((j) => {
      setP(j.product);
      if (j.product?.variants?.length) {
        const inStock = j.product.variants.find((v: Variant) => v.stockQuantity > 0);
        setSel((inStock || j.product.variants[0]).id);
      }
    });
    fetch("/api/products").then((r) => r.json()).then((j) => setRelated((j.products || []).filter((x: Product) => x.id !== id).slice(0, 4)));
  }, [id]);

  const variant = useMemo(() => p?.variants.find((v) => v.id === sel), [p, sel]);
  const price = variant ? parseFloat(variant.priceOverride || p!.basePrice) : 0;

  if (!p) return <div className="mx-auto max-w-5xl p-10 text-center text-zinc-400">Loading product…</div>;

  const flavors = [...new Set(p.variants.map((v) => v.flavor).filter(Boolean))] as string[];
  const strengths = [...new Set(p.variants.map((v) => v.nicotineStrength).filter(Boolean))] as string[];
  const sizes = [...new Set(p.variants.map((v) => v.bottleSize).filter(Boolean))] as string[];
  const colors = [...new Set(p.variants.map((v) => v.color).filter(Boolean))] as string[];

  const pick = (patch: Partial<Variant>) => {
    const cand = p.variants.filter((v) =>
      Object.entries(patch).every(([k, val]) => (v as Record<string, unknown>)[k] === val)
    );
    // keep other attrs of current selection where possible
    if (cand.length && variant) {
      const ranked = cand.sort((a, b) => {
        const score = (v: Variant) =>
          (v.flavor === (patch.flavor ?? variant.flavor) ? 1 : 0) +
          (v.nicotineStrength === (patch.nicotineStrength ?? variant.nicotineStrength) ? 1 : 0) +
          (v.bottleSize === (patch.bottleSize ?? variant.bottleSize) ? 1 : 0) +
          (v.color === (patch.color ?? variant.color) ? 1 : 0);
        return score(b) - score(a);
      });
      setSel(ranked[0].id);
    } else if (cand.length) setSel(cand[0].id);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-xs text-zinc-500"><Link href="/" className="hover:text-white">Home</Link> / <Link href="/shop" className="hover:text-white">Shop</Link> / {p.category?.name || "Product"}</p>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-zinc-800" />}
          </div>
          {p.images?.length > 1 && (
            <div className="mt-2 flex gap-2">{p.images.map((im, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={im} alt="" className="h-16 w-16 rounded-lg border border-white/10 object-cover" />
            ))}</div>
          )}
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-teal-300">{p.brand}</p>
          <h1 className="mt-1 text-3xl font-black text-white">{p.name}</h1>
          <p className="mt-2 text-xs text-zinc-400">{p.flavorProfile} · {p.vgPgRatio} VG/PG · {(p.tags || []).join(" · ")}</p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">{p.description}</p>

          {flavors.length > 0 && (
            <div className="mt-5"><p className="text-xs font-extrabold uppercase text-zinc-400">Flavour</p>
              <div className="mt-2 flex flex-wrap gap-2">{flavors.map((f) => (
                <button key={f} onClick={() => pick({ flavor: f })} className={`rounded-full px-4 py-1.5 text-sm font-bold ${variant?.flavor === f ? "bg-teal-500 text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>{f}</button>
              ))}</div></div>
          )}
          {strengths.length > 0 && (
            <div className="mt-4"><p className="text-xs font-extrabold uppercase text-zinc-400">Nicotine strength</p>
              <div className="mt-2 flex flex-wrap gap-2">{strengths.map((s) => (
                <button key={s} onClick={() => pick({ nicotineStrength: s })} className={`rounded-full px-4 py-1.5 text-sm font-bold ${variant?.nicotineStrength === s ? "bg-teal-500 text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>{s}</button>
              ))}</div></div>
          )}
          {sizes.length > 0 && (
            <div className="mt-4"><p className="text-xs font-extrabold uppercase text-zinc-400">Bottle size</p>
              <div className="mt-2 flex flex-wrap gap-2">{sizes.map((s) => (
                <button key={s} onClick={() => pick({ bottleSize: s })} className={`rounded-full px-4 py-1.5 text-sm font-bold ${variant?.bottleSize === s ? "bg-teal-500 text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>{s}</button>
              ))}</div></div>
          )}
          {colors.length > 0 && (
            <div className="mt-4"><p className="text-xs font-extrabold uppercase text-zinc-400">Colour</p>
              <div className="mt-2 flex flex-wrap gap-2">{colors.map((c) => (
                <button key={c} onClick={() => pick({ color: c })} className={`rounded-full px-4 py-1.5 text-sm font-bold ${variant?.color === c ? "bg-teal-500 text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>{c}</button>
              ))}</div></div>
          )}

          <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-black text-white">{gbp(price)}</p>
                {variant && <p className="text-xs text-zinc-400">SKU: {variant.sku} · {variantLabel({ flavor: variant.flavor, nicotineStrength: variant.nicotineStrength, bottleSize: variant.bottleSize, color: variant.color })}</p>}
              </div>
              <div>
                {variant && variant.stockQuantity <= 0 && <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-extrabold text-red-400">OUT OF STOCK</span>}
                {variant && variant.stockQuantity > 0 && variant.stockQuantity <= variant.lowStockThreshold && <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-extrabold text-amber-300">LOW STOCK · {variant.stockQuantity} left</span>}
                {variant && variant.stockQuantity > variant.lowStockThreshold && <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-extrabold text-emerald-300">● IN STOCK ({variant.stockQuantity})</span>}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <div className="flex items-center rounded-xl border border-white/10">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-3 py-2 font-bold">−</button>
                <span className="w-8 text-center font-extrabold">{qty}</span>
                <button onClick={() => setQty(Math.min(variant?.stockQuantity || 99, qty + 1))} className="px-3 py-2 font-bold">+</button>
              </div>
              <button
                disabled={!variant || variant.stockQuantity <= 0}
                onClick={() => variant && addToCart({ variantId: variant.id, productId: p.id, name: p.name, brand: p.brand, image: p.images?.[0], variantLabel: variantLabel({ flavor: variant.flavor, nicotineStrength: variant.nicotineStrength, bottleSize: variant.bottleSize, color: variant.color }), sku: variant.sku, unitPrice: price, stock: variant.stockQuantity }, qty)}
                className="flex-1 rounded-xl bg-teal-500 py-3 text-sm font-extrabold text-black hover:bg-teal-400 disabled:opacity-40"
              >Add to cart · {gbp(price * qty)}</button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">Live stock shown · deducted only after verified payment (webhook).</p>
          </div>

          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] leading-relaxed text-amber-200/90">
            ⚠️ Contains nicotine. Addictive. 18+ only. ID required on delivery. If you don&apos;t smoke, don&apos;t vape.
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <div className="mt-12">
          <h3 className="text-lg font-extrabold text-white">You may also like</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {related.map((r) => (
              <Link key={r.id} href={`/product/${r.id}`} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.images?.[0] && <img src={r.images[0]} alt={r.name} className="h-36 w-full object-cover" />}
                <div className="p-3"><p className="line-clamp-2 text-sm font-bold text-white">{r.name}</p><p className="text-xs text-zinc-400">{r.brand}</p></div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
