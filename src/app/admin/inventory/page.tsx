"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { gbp } from "@/lib/format";

type V = {
  id: string; sku: string; flavor?: string | null; nicotineStrength?: string | null; bottleSize?: string | null; color?: string | null;
  priceOverride?: string | null; stockQuantity: number; lowStockThreshold: number; isActive: boolean;
  productName?: string | null; brand?: string | null; basePrice?: string | null;
};

function InventoryInner() {
  const sp = useSearchParams();
  const [rows, setRows] = useState<V[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(sp.get("filter") || "all");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");

  const load = async () => {
    const r = await fetch("/api/variants");
    const j = await r.json();
    setRows(j.variants || []);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setFilter(sp.get("filter") || "all"); }, [sp]);

  const filtered = rows.filter((v) => {
    if (filter === "low" && !(v.stockQuantity <= v.lowStockThreshold && v.stockQuantity > 0)) return false;
    if (filter === "out" && !(v.stockQuantity <= 0)) return false;
    if (q && !`${v.productName} ${v.sku} ${v.flavor}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const quickSave = async (v: V) => {
    setSaving(v.id);
    const stock = editing[`stock_${v.id}`] ?? String(v.stockQuantity);
    const price = editing[`price_${v.id}`] ?? (v.priceOverride || "");
    const threshold = editing[`th_${v.id}`] ?? String(v.lowStockThreshold);
    await fetch("/api/variants", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: v.id, stockQuantity: stock, priceOverride: price, lowStockThreshold: threshold }) });
    setSaving("");
    setEditing({});
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-black text-white">Inventory · {filtered.length} SKUs</h2>
        <div className="ml-auto flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU / product…" className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm outline-none" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm">
            <option value="all">All</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead><tr className="bg-zinc-900 text-zinc-400 uppercase">
            <th className="p-3">Product / SKU</th><th className="p-3">Variant</th><th className="p-3">Price</th><th className="p-3">Stock</th><th className="p-3">Threshold</th><th className="p-3">Status</th><th className="p-3">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((v) => {
              const low = v.stockQuantity <= v.lowStockThreshold;
              const out = v.stockQuantity <= 0;
              return (
                <tr key={v.id} className={`border-t border-white/5 ${out ? "bg-red-500/5" : low ? "bg-amber-400/5" : "bg-zinc-950"}`}>
                  <td className="p-3"><p className="font-bold text-white">{v.productName}</p><p className="font-mono text-zinc-400">{v.sku}</p></td>
                  <td className="p-3 text-zinc-300">{[v.flavor, v.nicotineStrength, v.bottleSize, v.color].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="p-3">
                    <input defaultValue={v.priceOverride || v.basePrice || ""} onChange={(e) => setEditing({ ...editing, [`price_${v.id}`]: e.target.value })} className="w-20 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-white" />
                  </td>
                  <td className="p-3">
                    <input defaultValue={v.stockQuantity} onChange={(e) => setEditing({ ...editing, [`stock_${v.id}`]: e.target.value })} className={`w-20 rounded border px-2 py-1 text-white ${out ? "border-red-500 bg-red-500/10" : "border-white/10 bg-zinc-900"}`} type="number" />
                  </td>
                  <td className="p-3"><input defaultValue={v.lowStockThreshold} onChange={(e) => setEditing({ ...editing, [`th_${v.id}`]: e.target.value })} className="w-16 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-white" type="number" /></td>
                  <td className="p-3">{out ? <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-black text-red-400">OUT</span> : low ? <span className="rounded-full bg-amber-400/15 px-2 py-0.5 font-black text-amber-300">LOW</span> : <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 font-black text-emerald-300">OK</span>}</td>
                  <td className="p-3"><button onClick={() => quickSave(v)} disabled={saving === v.id} className="rounded-lg bg-amber-400 px-3 py-1 font-black text-black hover:bg-amber-300">{saving === v.id ? "…" : "Save"}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">Inline quick-edit: change stock / price / threshold then Save. Low-stock = stock ≤ threshold.</p>
    </div>
  );
}

export default function InventoryPage() {
  return <Suspense fallback={<div className="text-zinc-400">Loading…</div>}><InventoryInner /></Suspense>;
}
