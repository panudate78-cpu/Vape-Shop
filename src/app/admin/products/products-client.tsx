'use client';
import Link from 'next/link';
import { useState } from 'react';
import { gbp } from '@/lib/format';

type Product = { id: number; name: string; brand: string | null; basePrice: string | number; isActive: boolean; variantCount?: number; _count?: number };

export default function AdminProductsClient({ initial }: { initial: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const archive = async (p: Product) => {
    if (!confirm(`Archive "${p.name}"?\n\nIt will be hidden from the shop, POS, and product list. Past orders and accounting exports are preserved (product name stays visible on historical invoices).\n\nYou can reactivate it any time from this page.`)) return;
    setBusy(p.id); setMsg(null);
    try {
      const r = await fetch(`/api/products/${p.id}/archive`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ text: `Failed to archive ${p.name}: ${j.error || r.status}`, kind: 'err' }); setBusy(null); return; }
      setMsg({ text: `Archived "${j.name || p.name}". It's hidden from the shop now.`, kind: 'ok' });
      setProducts((ps) => ps.map((x) => x.id === p.id ? { ...x, isActive: false } : x));
    } catch (e: any) {
      setMsg({ text: `Network error: ${e?.message || 'check your connection'}`, kind: 'err' });
    } finally {
      setBusy(null);
    }
  };

  const reactivate = async (p: Product) => {
    setBusy(p.id); setMsg(null);
    try {
      const r = await fetch(`/api/products/${p.id}/archive`, { method: 'PATCH' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ text: `Failed to reactivate ${p.name}: ${j.error || r.status}`, kind: 'err' }); setBusy(null); return; }
      setMsg({ text: `Reactivated "${p.name}" — back in the shop.`, kind: 'ok' });
      setProducts((ps) => ps.map((x) => x.id === p.id ? { ...x, isActive: true } : x));
    } catch (e: any) {
      setMsg({ text: `Network error: ${e?.message || 'check your connection'}`, kind: 'err' });
    } finally {
      setBusy(null);
    }
  };

  const archivedCount = products.filter((p) => !p.isActive).length;
  const visible = showArchived ? products : products.filter((p) => p.isActive);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-amber-400">Products</h1>
        <div className="flex items-center gap-3">
          {archivedCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-400">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-amber-400" />
              Show archived ({archivedCount})
            </label>
          )}
          <Link href="/admin/products/new" className="rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-4 py-2 text-sm">+ New product</Link>
        </div>
      </div>
      {msg && <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200' : 'bg-red-500/10 border-red-400/30 text-red-200'}`}>{msg.text}</p>}
      <div className="rounded-2xl border border-white/10 bg-zinc-900 overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-left">
            <tr><th className="p-3">Name</th><th className="p-3">Brand</th><th className="p-3">Base price</th><th className="p-3">Status</th><th className="p-3 w-48"></th></tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className={`border-t border-zinc-800 ${p.isActive ? '' : 'opacity-60'}`}>
                <td className="p-3">
                  <span className="text-white font-medium">{p.name}</span>
                  {!p.isActive && <span className="ml-2 text-[10px] rounded-full bg-zinc-700 text-zinc-300 px-1.5 py-0.5 font-bold">archived</span>}
                </td>
                <td className="p-3 text-zinc-400">{p.brand || '—'}</td>
                <td className="p-3 text-zinc-200">{gbp(Number(p.basePrice))}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-400'}`}>{p.isActive ? 'Active' : 'Archived'}</span></td>
                <td className="p-3 flex gap-2 items-center">
                  <Link href={`/admin/products/${p.id}`} className="text-amber-400 underline text-xs font-bold">Edit</Link>
                  {p.isActive ? (
                    <button
                      onClick={() => archive(p)}
                      disabled={busy === p.id}
                      className="text-red-400 hover:text-red-300 text-xs font-bold disabled:opacity-50"
                    >{busy === p.id ? 'Archiving…' : '🗄 Archive'}</button>
                  ) : (
                    <button
                      onClick={() => reactivate(p)}
                      disabled={busy === p.id}
                      className="text-emerald-400 hover:text-emerald-300 text-xs font-bold disabled:opacity-50"
                    >{busy === p.id ? 'Reactivating…' : '↩ Reactivate'}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="p-6 text-center text-zinc-500 text-sm">{archivedCount > 0 && !showArchived ? 'All products are archived. Tick "Show archived" to see them.' : 'No products yet.'}</p>}
      </div>
    </div>
  );
}
