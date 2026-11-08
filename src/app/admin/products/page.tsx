"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { gbp } from "@/lib/format";

export default function AdminProducts() {
  const [rows, setRows] = useState<{ id: string; name: string; brand: string; basePrice: string; isActive: boolean; categoryName?: string | null; variants: { stockQuantity: number }[]; totalStock: number }[]>([]);
  const load = () => fetch("/api/products?includeInactive=1").then((r) => r.json()).then((j) => setRows(j.products || []));
  useEffect(() => { load(); }, []);
  const toggle = async (id: string, isActive: boolean) => {
    await fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !isActive }) });
    load();
  };
  const del = async (id: string) => {
    if (!confirm("Delete product + variants?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    load();
  };
  return (
    <div>
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-black text-white">Products ({rows.length})</h2>
        <Link href="/admin/products/new" className="ml-auto rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-black">+ New product</Link>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[800px] text-left text-xs">
          <thead><tr className="bg-zinc-900 uppercase text-zinc-400"><th className="p-3">Name</th><th className="p-3">Brand / Cat</th><th className="p-3">Price</th><th className="p-3">Stock</th><th className="p-3">Active</th><th className="p-3">Actions</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-white/5 bg-zinc-950">
                <td className="p-3 font-bold text-white">{p.name}<br /><span className="font-mono text-[11px] text-zinc-500">{p.id.slice(0, 8)}</span></td>
                <td className="p-3 text-zinc-300">{p.brand}<br /><span className="text-zinc-500">{p.categoryName}</span></td>
                <td className="p-3 text-white">{gbp(p.basePrice)}</td>
                <td className="p-3 text-white">{p.totalStock} ({p.variants.length} vars)</td>
                <td className="p-3"><button onClick={() => toggle(p.id, p.isActive)} className={`rounded-full px-2.5 py-0.5 font-black ${p.isActive ? "bg-emerald-400/15 text-emerald-300" : "bg-zinc-700 text-zinc-300"}`}>{p.isActive ? "LIVE" : "HIDDEN"}</button></td>
                <td className="p-3 flex gap-2">
                  <Link href={`/admin/products/${p.id}`} className="rounded-lg bg-white/10 px-3 py-1 font-bold text-white">Edit</Link>
                  <Link href={`/product/${p.id}`} className="rounded-lg border border-white/10 px-3 py-1 text-zinc-300">View</Link>
                  <button onClick={() => del(p.id)} className="rounded-lg border border-red-500/40 px-3 py-1 text-red-400">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
