"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FLAVOR_PROFILES, VG_PG, NICOTINE_STRENGTHS, BOTTLE_SIZES, gbp } from "@/lib/format";

type Variant = {
  id?: string; sku: string; barcode: string; flavor: string; nicotineStrength: string; bottleSize: string; color: string;
  priceOverride: string; stockQuantity: string; lowStockThreshold: string; isActive: boolean; _delete?: boolean;
};

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
function sanitizeDescription(text: string): string {
  // Strip raw hex colour codes (#14b8a6, #fff, #FF000080, etc.) that can leak
  // in when users paste formatted/HTML content into editors.
  return String(text || "").replace(HEX_COLOR_RE, "").replace(/\s{2,}/g, " ").trim();
}

function variantRowKey(v: Variant, idx: number): string {
  // Stable React keys — never array indices, otherwise React mis-pairs rows
  // when variants are added/removed/archived (caused the "IVG shows zero
  // variants" bug after saves).
  if (v.id) return `v-${v.id}`;
  return `new-${idx}-${v.sku || "blank"}`;
}

export default function ProductEditor({ mode, productId }: { mode: "create" | "edit"; productId?: string }) {
  const router = useRouter();
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ categoryId: "", name: "", brand: "", description: "", basePrice: "14.99", vgPgRatio: "70/30", flavorProfile: "Fruity", tags: "", images: "", isActive: true });
  const [variants, setVariants] = useState<Variant[]>([]);
  const [hideArchived, setHideArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const [loaded, setLoaded] = useState<{ formHash: string; variantsHash: string } | null>(null);

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
        const nextForm = {
          categoryId: p.categoryId || "", name: p.name, brand: p.brand, description: p.description || "",
          basePrice: String(p.basePrice), vgPgRatio: p.vgPgRatio || "70/30", flavorProfile: p.flavorProfile || "Fruity",
          tags: (p.tags || []).join(", "), images: (p.images || []).join("\n"), isActive: p.isActive,
        };
        setForm(nextForm);
        // Load ALL variants — including isActive=false (archived) — so the
        // editor can show them dimmed with a reactivate toggle, instead of
        // them silently disappearing and being dropped from payload.
        const vs: Variant[] = (j.variants || []).map((v: Record<string, unknown>) => ({
          id: v.id as string, sku: String(v.sku || ""), barcode: String((v.barcode as string) || ""), flavor: String(v.flavor || ""), nicotineStrength: String(v.nicotineStrength || ""),
          bottleSize: String(v.bottleSize || ""), color: String(v.color || ""),
          priceOverride: v.priceOverride != null && v.priceOverride !== null ? String(v.priceOverride) : "",
          stockQuantity: String((v.stockQuantity as number) ?? 0), lowStockThreshold: String((v.lowStockThreshold as number) ?? 10),
          isActive: (v.isActive as boolean) ?? true,
        }));
        setVariants(vs);
        const snapshot = { formHash: JSON.stringify(nextForm), variantsHash: JSON.stringify(vs) };
        setLoaded(snapshot);
      });
    } else {
      setLoaded({ formHash: JSON.stringify({ categoryId: "", name: "", brand: "", description: "", basePrice: "14.99", vgPgRatio: "70/30", flavorProfile: "Fruity", tags: "", images: "", isActive: true }), variantsHash: JSON.stringify([]) });
    }
  }, [mode, productId]);

  // ---- Unsaved-changes tracking ----
  const formKey = JSON.stringify(form);
  const variantsKey = JSON.stringify(variants.map((v) => ({ ...v, _delete: v._delete ? true : false })));
  const dirty = !!(loaded && (loaded.formHash !== formKey || loaded.variantsHash !== variantsKey));

  // Warn on browser close/navigation when unsaved.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const basePriceNum = Number(form.basePrice);
  const finalBase = !isNaN(basePriceNum) && basePriceNum > 0 ? basePriceNum : 0;

  const toggleIn = (arr: string[], v: string, set: (x: string[]) => void) => {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const generateMatrix = () => {
    const flavors = mFlavors.split(",").map((s) => s.trim()).filter(Boolean);
    if (!flavors.length || (!mNic.length && !mSizes.length)) { setMsg({ text: "Enter at least 1 flavour + 1 nicotine/size.", kind: "err" }); return; }
    const nics = mNic.length ? mNic : [""];
    const sizes = mSizes.length ? mSizes : [""];
    const fresh: Variant[] = [];
    for (const f of flavors) for (const n of nics) for (const s of sizes) {
      const exists = variants.some((v) => !v._delete && v.flavor === f && v.nicotineStrength === n && v.bottleSize === s);
      if (exists) continue;
      const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
      const sku = `${(form.brand || "PRD").slice(0, 3).toUpperCase()}-${f.split(" ").map((w) => w[0]).join("").toUpperCase()}-${n.replace("mg", "") || "0"}-${s.replace("ml", "") || "STD"}-${rand}`;
      fresh.push({ sku, barcode: "", flavor: f, nicotineStrength: n, bottleSize: s, color: "", priceOverride: mPrice, stockQuantity: mStock, lowStockThreshold: "10", isActive: true });
    }
    setVariants([...variants, ...fresh]);
    setMsg({ text: `Generated ${fresh.length} variant(s).`, kind: "ok" });
  };

  const save = async () => {
    // --- Client-side validation ---
    if (!form.name.trim()) { setMsg({ text: "Name is required.", kind: "err" }); return; }
    const bp = Number(form.basePrice);
    if (isNaN(bp) || bp <= 0) { setMsg({ text: "Base price must be greater than £0.", kind: "err" }); return; }

    setSaving(true); setMsg(null);
    const cleanedDescription = sanitizeDescription(form.description);
    const cleanVariants = variants
      .filter((v) => {
        // Drop rows that were freshly added AND immediately marked _delete
        // (never existed on server) — sending them would create-then-delete.
        if (v._delete && !v.id) return false;
        return true;
      })
      .map((v) => ({
        id: v.id, sku: v.sku, barcode: v.barcode.trim() || null, flavor: v.flavor, nicotineStrength: v.nicotineStrength, bottleSize: v.bottleSize,
        color: v.color || null,
        priceOverride: v.priceOverride && Number(v.priceOverride) > 0 ? Number(v.priceOverride).toFixed(2) : "",
        stockQuantity: parseInt(v.stockQuantity || "0", 10),
        lowStockThreshold: parseInt(v.lowStockThreshold || "10", 10),
        isActive: v.isActive && !v._delete,
        _delete: !!v._delete, // always send _delete flag so server deactivates existing rows
      }));

    const payload = {
      categoryId: form.categoryId || null,
      name: form.name.trim(), brand: form.brand || "House Brand", description: cleanedDescription,
      basePrice: bp.toFixed(2), vgPgRatio: form.vgPgRatio, flavorProfile: form.flavorProfile,
      tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      images: form.images.split("\n").map((s) => s.trim()).filter(Boolean),
      isActive: form.isActive,
      variants: cleanVariants,
    };
    const url = mode === "create" ? "/api/products" : `/api/products/${productId}`;
    try {
      const r = await fetch(url, { method: mode === "create" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({ error: `Unexpected error (${r.status})` }));
      if (!r.ok) { setMsg({ text: j.error || "Save failed", kind: "err" }); setSaving(false); return; }
      setMsg({ text: mode === "create" ? "Product created ✓" : "Saved ✓", kind: "ok" });
      setSaving(false);
      if (mode === "create") {
        router.push("/admin/products");
      } else {
        // Refresh snapshot so dirty flag clears
        const snapshot = { formHash: JSON.stringify({ ...form, description: cleanedDescription, basePrice: bp.toFixed(2) }), variantsHash: JSON.stringify(cleanVariants.map((v) => ({ id: v.id, sku: v.sku, barcode: v.barcode || "", flavor: v.flavor, nicotineStrength: v.nicotineStrength, bottleSize: v.bottleSize, color: v.color || "", priceOverride: v.priceOverride || "", stockQuantity: String(v.stockQuantity), lowStockThreshold: String(v.lowStockThreshold), isActive: v.isActive }))) };
        setLoaded(snapshot);
      }
    } catch (e: any) {
      setMsg({ text: `Network error: ${e?.message || "check your connection"}`, kind: "err" });
      setSaving(false);
    }
  };

  const doArchive = async () => {
    if (!productId) return;
    let confirmedMsg = "Archive this product?\n\nIt will be hidden from the shop, POS, and product list. All past orders and accounting exports are preserved (product name stays visible on historical invoices). You can reactivate it later from the products list.";
    if (dirty) confirmedMsg = "\u26a0 You have unsaved changes that will NOT be saved before archiving.\n\n" + confirmedMsg + "\n\nArchive anyway?";
    else confirmedMsg += "\n\nContinue?";
    if (!confirm(confirmedMsg)) return;
    setArchiving(true); setMsg(null);
    try {
      const r = await fetch(`/api/products/${productId}/archive`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ text: j.error || "Archive failed", kind: "err" }); setArchiving(false); return; }
      setMsg({ text: `Archived "${j.name || "product"}" — redirecting…`, kind: "ok" });
      setTimeout(() => router.push("/admin/products"), 700);
    } catch (e: any) {
      setMsg({ text: `Network error: ${e?.message || "check your connection"}`, kind: "err" });
      setArchiving(false);
    }
  };

  const visibleVariants = variants.filter((v) => !hideArchived || (v.isActive && !v._delete));
  const archivedCount = variants.filter((v) => !v.isActive || v._delete).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4 rounded-2xl border border-white/10 bg-zinc-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/admin/products" className="text-sm text-zinc-400 hover:text-white">← Products</Link>
          <div className="flex items-center gap-2">
            {dirty && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">Unsaved changes</span>}
            {!form.isActive && <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-[11px] font-bold text-zinc-400">archived</span>}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-zinc-300">Name*<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" /></label>
          <label className="text-xs font-bold text-zinc-300">Brand<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" /></label>
          <label className="text-xs font-bold text-zinc-300">Category<select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm"><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-xs font-bold text-zinc-300">
            Base price (£)
            <input value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" />
            <span className="mt-1 block text-[11px] font-normal text-zinc-500">Default price for every variant. Leave a variant's Price override blank to use this price; fill it in to set a variant-specific price.</span>
          </label>
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
                  setMsg({ text: "Uploading…", kind: "ok" });
                  const fd = new FormData();
                  fd.append("file", f);
                  try {
                    const r = await fetch("/api/upload", { method: "POST", body: fd });
                    const j = await r.json().catch(() => ({ error: `Unexpected error (${r.status})` }));
                    if (!r.ok) { setMsg({ text: j.error || "Upload failed", kind: "err" }); return; }
                    const existing = form.images.split("\n").map((s) => s.trim()).filter(Boolean);
                    setForm({ ...form, images: [...existing, j.url].join("\n") });
                    setMsg({ text: "Uploaded ✓", kind: "ok" });
                  } catch (e: any) { setMsg({ text: `Network error: ${e?.message || "check your connection"}`, kind: "err" }); }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Upload from your computer, or paste external URLs (one per line). First image is the main product photo.</p>
          <textarea value={form.images} onChange={(e) => setForm({ ...form, images: e.target.value })} rows={3} placeholder="/uploads/xxx.jpg&#10;https://example.com/bottle.jpg"
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-xs outline-none" />
          {(() => {
            const urls = form.images.split("\n").map((s) => s.trim()).filter(Boolean);
            if (!urls.length) return null;
            return (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {urls.map((u, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-zinc-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                    {i === 0 && <span className="absolute left-1 top-1 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-black">MAIN</span>}
                    <button type="button" onClick={() => {
                      const copy = urls.slice(); copy.splice(i, 1);
                      setForm({ ...form, images: copy.join("\n") });
                    }} className="absolute right-1 top-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition">✕</button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-white">Variants <span className="text-zinc-500 font-normal">({variants.filter((v) => v.isActive && !v._delete).length} active{archivedCount ? `, ${archivedCount} archived` : ""})</span></h3>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400">
              <input type="checkbox" checked={hideArchived} onChange={(e) => setHideArchived(e.target.checked)} className="accent-amber-400" />
              Hide archived
            </label>
          </div>
          <div className="mt-2 space-y-2">
            {visibleVariants.map((v, i) => {
              // Find original index in the full variants array (for mutations)
              const realIndex = variants.indexOf(v);
              const overrideNum = v.priceOverride ? Number(v.priceOverride) : NaN;
              const hasOverride = !isNaN(overrideNum) && overrideNum > 0;
              const sellsAt = hasOverride ? overrideNum : finalBase;
              return (
                <div key={variantRowKey(v, realIndex)} className={`grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-5 ${(v._delete || !v.isActive) ? "border-zinc-700 bg-zinc-950/40 opacity-60" : "border-white/10 bg-zinc-950"}`}>
                  <input value={v.sku} onChange={(e) => { const c = [...variants]; c[realIndex].sku = e.target.value; setVariants(c); }} placeholder="SKU" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 font-mono text-xs" />
                  <input value={v.barcode} onChange={(e) => { const c = [...variants]; c[realIndex].barcode = e.target.value; setVariants(c); }} placeholder="Barcode (EAN/UPC)" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 font-mono text-xs" title="Scan or type the barcode — POS will look this up first" />
                  <input value={v.flavor} onChange={(e) => { const c = [...variants]; c[realIndex].flavor = e.target.value; setVariants(c); }} placeholder="Flavour" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                  <input value={v.nicotineStrength} onChange={(e) => { const c = [...variants]; c[realIndex].nicotineStrength = e.target.value; setVariants(c); }} placeholder="Nic e.g. 3mg" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                  <input value={v.bottleSize} onChange={(e) => { const c = [...variants]; c[realIndex].bottleSize = e.target.value; setVariants(c); }} placeholder="Size e.g. 50ml" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                  <input value={v.color} onChange={(e) => { const c = [...variants]; c[realIndex].color = e.target.value; setVariants(c); }} placeholder="Colour" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                  <div className="flex flex-col gap-0.5">
                    <input value={v.priceOverride} onChange={(e) => { const c = [...variants]; c[realIndex].priceOverride = e.target.value; setVariants(c); }} placeholder="Override (blank = base)" type="number" step="0.01" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                    <span className={`text-[10px] font-bold ${hasOverride ? "text-amber-300" : "text-emerald-400"}`}>sells @ {gbp(sellsAt)}{hasOverride ? "" : " (base)"}</span>
                  </div>
                  <input value={v.stockQuantity} onChange={(e) => { const c = [...variants]; c[realIndex].stockQuantity = e.target.value; setVariants(c); }} placeholder="Stock" type="number" className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs" />
                  <div className="flex gap-1">
                    <button onClick={() => { const c = [...variants]; c[realIndex].isActive = !c[realIndex].isActive; if (!c[realIndex].isActive) c[realIndex]._delete = false; setVariants(c); }} className={`flex-1 rounded px-2 py-1 text-[10px] font-bold ${v.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-600/30 text-zinc-400"}`}>{v.isActive ? "Active" : "Archived"}</button>
                    <button onClick={() => { const c = [...variants]; c[realIndex]._delete = !c[realIndex]._delete; setVariants(c); }} className="rounded bg-red-500/15 px-2 py-1 text-xs font-bold text-red-400">{v._delete ? "Undo" : "Remove"}</button>
                  </div>
                </div>
              );
            })}
            <button onClick={() => setVariants([...variants, { sku: `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,4).toUpperCase()}`, barcode: "", flavor: "", nicotineStrength: "", bottleSize: "", color: "", priceOverride: "", stockQuantity: "20", lowStockThreshold: "10", isActive: true }])} className="w-full rounded-xl border border-dashed border-white/20 py-2 text-xs font-bold text-zinc-300">+ Add single variant</button>
          </div>
        </div>
        {msg && <p className={`text-xs font-bold ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={saving || archiving} className="flex-1 rounded-xl bg-amber-400 py-3 text-sm font-black text-black hover:bg-amber-300 disabled:opacity-60">{saving ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}</button>
          {mode === "edit" && productId && (
            <button
              onClick={doArchive}
              disabled={saving || archiving}
              className="rounded-xl bg-red-600 hover:bg-red-500 px-4 py-3 text-sm font-black text-white transition disabled:opacity-60"
              title="Archive this product (hidden from shop, order history preserved)"
            >{archiving ? "Archiving…" : "🗄 Archive"}</button>
          )}
        </div>
      </div>

      <div className="h-fit rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5 lg:sticky lg:top-24">
        <h3 className="font-extrabold text-white">⚡ Variant matrix builder</h3>
        <p className="mt-1 text-xs text-zinc-400">Flavour × Nicotine × Size → auto-generates SKUs. Override prices inherit the base price unless changed.</p>
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
