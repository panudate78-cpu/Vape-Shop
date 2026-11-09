'use client';
import Link from 'next/link';
import { useState } from 'react';

type Product = { id: number; name: string; brand: string | null; basePrice: string | number; isActive: boolean; _count?: number };

export default function AdminProductsClient({ initial }: { initial: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>('');

  const del = async (p: Product) => {
    if (!confirm(`Delete "${p.name}"?\n\n• If there are past orders, it will be hidden (kept for accounts).\n• Otherwise it will be permanently removed.\n\nThis cannot be undone.`)) return;
    setBusy(p.id); setMsg('');
    const r = await fetch(`/api/products/${p.id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg(`Failed to delete ${p.name}: ${j.error || r.status}`); return; }
    if (j.softDeleted) {
      setMsg(`"${p.name}" deactivated (${j.orderCount} past order${j.orderCount === 1 ? '' : 's'} preserved).`);
      setProducts((ps) => ps.map((x) => x.id === p.id ? { ...x, isActive: false } : x));
    } else {
      setMsg(`"${p.name}" permanently deleted.`);
      setProducts((ps) => ps.filter((x) => x.id !== p.id));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-amber-400">Products</h1>
        <Link href="/admin/products/new" className="rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-4 py-2 text-sm">+ New product</Link>
      </div>
      {msg && <p className="mt-3 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-200 px-3 py-2 text-sm">{msg}</p>}
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-0 overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-left">
            <tr><th className="p-3">Name</th><th className="p-3">Brand</th><th className="p-3">Base price</th><th className="p-3">Active</th><th className="p-3 w-40"></th></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={`border-t border-zinc-800 ${p.isActive ? '' : 'opacity-50'}`}>
                <td className="p-3">{p.name}{!p.isActive && <span className="ml-2 text-[10px] rounded-full bg-zinc-700 text-zinc-300 px-1.5 py-0.5 font-bold">hidden</span>}</td>
                <td className="p-3 text-zinc-400">{p.brand}</td>
                <td className="p-3">£{Number(p.basePrice).toFixed(2)}</td>
                <td className="p-3">{p.isActive ? '✓' : '✗'}</td>
                <td className="p-3 flex gap-2 items-center">
                  <Link href={`/admin/products/${p.id}`} className="text-amber-400 underline text-xs font-bold">Edit</Link>
                  <button
                    onClick={() => del(p)}
                    disabled={busy === p.id}
                    className="text-red-400 hover:text-red-300 text-xs font-bold disabled:opacity-50"
                  >{busy === p.id ? 'Deleting…' : 'Delete'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && <p className="p-6 text-center text-zinc-500 text-sm">No products yet.</p>}
      </div>
    </div>
  );
}
