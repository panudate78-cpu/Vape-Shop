"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FLAVOR_PROFILES, VG_PG, NICOTINE_STRENGTHS, BOTTLE_SIZES } from "@/lib/format";

type Variant = {
  id?: string; sku: string; flavor: string; nicotineStrength: string; bottleSize: string; color: string;
  priceOverride: string; stockQuantity: string; lowStockThreshold: string; isActive: boolean; _delete?: boolean;
};

export default function ProductEditor({ mode, productId }: { mode: "create" | "edit"; productId?: string }) {
  const router = useRouter();
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ categoryId: "", name: "", brand: "", description: "", basePrice: "14.99", vgPgRatio: "70/30", flavorProfile: "Fruity", tags: "", images: "", isActive: true });
  const [variants, setVariants] = useState<Variant[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // matrix builder state
  const [mFlavors, setMFlavors] = useState("Mango Ice, Blue Razz Ice");
  const [mNic, setMNic] = useState<string[]>(["0mg", "3mg"]);
  const [mSizes, setMSizes] = useState<string[]>(["50ml"]);
  const [mPrice, setMPrice] = useState("14.99");
  const [mStock, setMStock] = useState("50");

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((j) => setCats(Array.isArray(j) ? j : (j.categories || [])));
    if (mode === "edit" && productId) {
      fetch(`/api/products/${productId}`).then((r) => r.json()).then((j) => {
        const p = j.product;
        if (!p) return;
        setForm({
          categoryId: p.categoryId || "", name: p.name, brand: p.brand, description: p.description || "",
          basePrice: String(p.basePrice), vgPgRatio: p.vgPgRatio || "70/30", flavorProfile: p.flavorProfile || "Fruity",
          tags: (p.tags || []).join(", "), images: (p.images || []).join("\n"), isActive: p.isActive,
        });
        setVariants((p.variants || []).map((v: Record<string, unknown>) => ({
          id: v.id as string, sku: String(v.sku || ""), flavor: String(v.flavor || ""), nicotineStrength: String(v.nicotineStrength || ""),
          bottleSize: String(v.bottleSize || ""), color: String(v.color || ""), priceOverride: v.priceOverride != null ? String(v.priceOverride) : "",
          stockQuantity: String((v.stockQuantity as number) ?? 0), lowStockThreshold: String((v.lowStockThreshold as number) ?? 10), isActive: (v.isActive as boolean) ?? true,
        })));
      });
    }
  }, [mode, productId]);

  const toggleIn = (arr: string[], v: string, set: (x: string[]) => void) => {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const generateMatrix = () => {
    const flavors = mFlavors.split(",").map((s) => s.trim()).filter(Boolean);
    if (!flavors.length || (!mNic.length && !mSizes.length)) { setMsg("Enter at least 1 flavour + 1 nicotine/size."); return; }
    const nics = mNic.length ? mNic : [""];
    const sizes = mSizes.length ? mSizes : [""];
    const fresh: Variant[] = [];
    for (const f of flavors) for (const n of nics) for (const s of sizes) {
      const exists = variants.some((v) => !v._delete && v.flavor === f && v.nicotineStrength === n && v.bottleSize === s);
      if (exists) continue;
      const sku = `${(form.brand || "PRD").slice(0, 3).toUpperCase()}-${f.split(" ").map((w) => w[0]).join("").toUpperCase()}-${n.replace("mg", "") || "0"}-${s.replace("ml", "") || "STD"}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      fresh.push({ sku, flavor: f, nicotineStrength: n, bottleSize: s, color: "", priceOverride: mPrice, stockQuantity: mStock, lowStockThreshold: "10", isActive: true });
    }
    setVariants([...variants, ...fresh]);
    setMsg(`Generated ${fresh.length} variant(s).`);
  };

  const save = async () => {
    setSaving(true); setMsg("");
    const payload = {
      categoryId: form.categoryId || null,
      name: form.name, brand: form.brand || "House Brand", description: form.description,
      basePrice: form.basePrice, vgPgRatio: form.vgPgRatio, flavorProfile: form.flavorProfile,
      tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      images: form.images.split("\n").map((s) => s.trim()).filter(Boolean),
      isActive: form.isActive,
      variants: variants.map((v) => ({ ...v, stockQuantity: parseInt(v.stockQuantity || "0", 10), lowStockThreshold: parseInt(v.lowStockThreshold || "10", 10) })),
    };
    const url = mode === "create" ? "/api/products" : `/api/products/${productId}`;
    const r = await fetch(url, { method: mode === "create" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();
    setSaving(false);
    if (!r.ok) { setMsg(j.error || "Save failed"); return; }
    router.push("/admin/products");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4 rounded-2xl border border-white/10 bg-zinc-900 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-zinc-300">Name*<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" /></label>
          <label className="text-xs font-bold text-zinc-300">Brand<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" /></label>
          <label className="text-xs font-bold text-zinc-300">Category<select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm"><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-xs font-bold text-zinc-300">Base price (£)<input value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" /></label>
          <label className="text-xs font-bold text-zinc-300">VG/PG<select value={form.vgPgRatio} onChange={(e) => setForm({ ...form, vgPgRatio: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm">{VG_PG.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="text-xs font-bold text-zinc-300">Flavour profile<select value={form.flavorProfile} onChange={(e) => setForm({ ...form, flavorProfile: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm">{FLAVOR_PROFILES.map((v) => <option key={v}>{v}</option>)}</select></label>
        </div>
        <label className="block text-xs font-bold text-zinc-300">Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-zinc-300">Tags (comma separated)<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="shortfill, bestseller" className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" /></label>
          <label className="flex items-center gap-2 text-xs font-bold text-zinc-300"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="accent-amber-400" /> Active / visible in store</label>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-300">Product images</span>
            <label className="cursor-pointer rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-3 py-1.5 text-xs">
              ⬆ Upload image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setMsg('Uploading…');
                  const fd = new FormData();
                  fd.append('file', f);
                  try {
                    const r = await fetch('/api/upload', { method: 'POST', body: fd });
                    const j = await r.json();
                    if (!r.ok) { setMsg(j.error || 'Upload failed'); return; }
                    const existing = form.images.split('\n').map((s) => s.trim()).filter(Boolean);
                    setForm({ ...form, images: [...existing, j.url].join('\n') });
                    setMsg('Uploaded ✓');
                  } catch { setMsg('Upload failed — are you signed in as admin?'); }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Upload from your computer, or paste external URLs (one per line). First image is the main product photo.</p>
          <textarea value={form.images} onChange={(e) => setForm({ ...form, images: e.target.value })} rows={3} placeholder="/uploads/xxx.jpg&#10;https://example.com/bottle.jpg"
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-xs outline-none" />
          {(() => {
            const urls = form.images.split('\n').map((s) => s.trim()).filter(Boolean);
            if (!urls.length) return null;
            return (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {urls.map((u, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-zinc-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} />
                    {i === 0 && <span className="absolute left-1 top-1 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-black">MAIN</span>}
                    <button type="button" onClick={() => {
                      const copy = urls.slice(); copy.splice(i, 1);
                      setForm({ ...form, images: copy.join('\n') });
                    }} className="absolute right-1 top-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition">✕</button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        <div>
          <h3 className="font-extrabold text-white">Variants ({variants.filter((v) => !v._delete).length})</h3>
          <div className="mt-2 space-y-2">
            {variants.map((v, i) => (
              <div key={i} className={`grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-4 ${v._delete ? "border-red-500/50 opacity-40" : "border-white/10 bg-zinc-950"}`}>
                <input value={v.sku} onChange={(e) => { const c = [...variants]; c[i].sku = e.target.value; setVariants(c); }} placeholder="SKU" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 font-mono text-xs" />
                <input value={v.flavor} onChange={(e) => { const c = [...variants]; c[i].flavor = e.target.value; setVariants(c); }} placeholder="Flavour" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                <input value={v.nicotineStrength} onChange={(e) => { const c = [...variants]; c[i].nicotineStrength = e.target.value; setVariants(c); }} placeholder="Nic e.g. 3mg" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                <input value={v.bottleSize} onChange={(e) => { const c = [...variants]; c[i].bottleSize = e.target.value; setVariants(c); }} placeholder="Size e.g. 50ml" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                <input value={v.color} onChange={(e) => { const c = [...variants]; c[i].color = e.target.value; setVariants(c); }} placeholder="Colour" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                <input value={v.priceOverride} onChange={(e) => { const c = [...variants]; c[i].priceOverride = e.target.value; setVariants(c); }} placeholder="Price override" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                <input value={v.stockQuantity} onChange={(e) => { const c = [...variants]; c[i].stockQuantity = e.target.value; setVariants(c); }} placeholder="Stock" type="number" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                <button onClick={() => { const c = [...variants]; c[i]._delete = !c[i]._delete; setVariants(c); }} className="rounded bg-red-500/15 px-2 py-1 text-xs font-bold text-red-400">{v._delete ? "Undo" : "Remove"}</button>
              </div>
            ))}
            <button onClick={() => setVariants([...variants, { sku: `SKU-${Date.now().toString(36).toUpperCase()}`, flavor: "", nicotineStrength: "", bottleSize: "", color: "", priceOverride: "", stockQuantity: "20", lowStockThreshold: "10", isActive: true }])} className="w-full rounded-xl border border-dashed border-white/20 py-2 text-xs font-bold text-zinc-300">+ Add single variant</button>
          </div>
        </div>
        {msg && <p className="text-xs font-bold text-amber-300">{msg}</p>}
        <button onClick={save} disabled={saving} className="w-full rounded-xl bg-amber-400 py-3 text-sm font-black text-black hover:bg-amber-300">{saving ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}</button>
      </div>

      <div className="h-fit rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5 lg:sticky lg:top-24">
        <h3 className="font-extrabold text-white">⚡ Variant matrix builder</h3>
        <p className="mt-1 text-xs text-zinc-400">Flavour × Nicotine × Size → auto-generates SKUs.</p>
        <label className="mt-3 block text-xs font-bold text-zinc-300">Flavours (comma separated)<input value={mFlavors} onChange={(e) => setMFlavors(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs outline-none" /></label>
        <p className="mt-3 text-xs font-bold text-zinc-300">Nicotine</p>
        <div className="mt-1 flex flex-wrap gap-1.5">{NICOTINE_STRENGTHS.map((n) => <button key={n} onClick={() => toggleIn(mNic, n, setMNic)} className={`rounded-full px-3 py-1 text-xs font-bold ${mNic.includes(n) ? "bg-violet-600 text-white" : "bg-white/5 text-zinc-300"}`}>{n}</button>)}</div>
        <p className="mt-3 text-xs font-bold text-zinc-300">Sizes</p>
        <div className="mt-1 flex flex-wrap gap-1.5">{BOTTLE_SIZES.map((s) => <button key={s} onClick={() => toggleIn(mSizes, s, setMSizes)} className={`rounded-full px-3 py-1 text-xs font-bold ${mSizes.includes(s) ? "bg-violet-600 text-white" : "bg-white/5 text-zinc-300"}`}>{s}</button>)}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-zinc-300">Price £<input value={mPrice} onChange={(e) => setMPrice(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs outline-none" /></label>
          <label className="text-xs font-bold text-zinc-300">Stock each<input value={mStock} onChange={(e) => setMStock(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs outline-none" /></label>
        </div>
        <button onClick={generateMatrix} className="mt-3 w-full rounded-xl bg-violet-600 py-2.5 text-xs font-extrabold text-white">Generate combinations</button>
      </div>
    </div>
  );
}
