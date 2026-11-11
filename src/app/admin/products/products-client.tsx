'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { gbp } from '@/lib/format';

type Product = { id: number; name: string; brand: string | null; basePrice: string | number; isActive: boolean; variantCount?: number; _count?: number };
type Cat = { id: number; name: string };

export default function AdminProductsClient({ initial, categories = [] }: { initial: Product[]; categories?: Cat[] }) {
  const [products, setProducts] = useState<Product[]>(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const archive = async (p: Product) => {
    if (!confirm(`Archive "${p.name}"?\n\nIt will be hidden from the shop, POS, and product list. Past orders and accounting exports are preserved (product name stays visible on historical invoices).\n\nYou can reactivate it later.`)) return;
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
  const visible = useMemo(() => (showArchived ? products : products.filter((p) => p.isActive)), [products, showArchived]);
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((p) => p.id)));

  const bulk = async (action: 'archive' | 'reactivate' | 'set_category') => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === 'archive' && !confirm(`Archive ${ids.length} product${ids.length === 1 ? '' : 's'}?\n\nThey will be hidden from the shop, POS and the product list. Past orders are kept.`)) return;
    if (action === 'set_category' && !bulkCategory) { setMsg({ text: 'Choose a category first.', kind: 'err' }); return; }
    setBulkBusy(true); setMsg(null);
    try {
      const body: Record<string, unknown> = { ids, action };
      if (action === 'set_category') body.categoryId = Number(bulkCategory);
      const r = await fetch('/api/admin/products/bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ text: `Bulk ${action.replace('_', ' ')} failed: ${j.error || r.status}`, kind: 'err' }); return; }
      const skipped = (j.unchanged || 0) + (j.missing?.length || 0);
      const what = action === 'archive' ? 'archived' : action === 'reactivate' ? 'reactivated' : 'moved to the new category';
      setMsg({ text: `${j.changed} product${j.changed === 1 ? '' : 's'} ${what}.${skipped ? ` ${skipped} skipped (already in that state, or no longer exists).` : ''}`, kind: 'ok' });
      if (action === 'archive') setProducts((ps) => ps.map((x) => ids.includes(x.id) ? { ...x, isActive: false } : x));
      if (action === 'reactivate') setProducts((ps) => ps.map((x) => ids.includes(x.id) ? { ...x, isActive: true } : x));
      setSelected(new Set());
    } catch (e: any) {
      setMsg({ text: `Network error: ${e?.message || 'check your connection'}`, kind: 'err' });
    } finally {
      setBulkBusy(false);
    }
  };

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

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm">
          <b className="text-amber-200">{selected.size} selected</b>
          <button onClick={() => bulk('archive')} disabled={bulkBusy} className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Archive selected</button>
          <button onClick={() => bulk('reactivate')} disabled={bulkBusy} className="rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50">Reactivate selected</button>
          <span className="flex items-center gap-2">
            <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-white">
              <option value="">Set category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => bulk('set_category')} disabled={bulkBusy || !bulkCategory} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Apply</button>
          </span>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-zinc-400 underline">Clear selection</button>
        </div>
      )}

      {msg && <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200' : 'bg-red-500/10 border-red-400/30 text-red-200'}`}>{msg.text}</p>}
      <div className="rounded-2xl border border-white/10 bg-zinc-900 overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-left">
            <tr>
              <th className="p-3 w-10"><input type="checkbox" aria-label="Select all shown" checked={allVisibleSelected} onChange={toggleAll} className="accent-amber-400" /></th>
              <th className="p-3">Name</th><th className="p-3">Brand</th><th className="p-3">Base price</th><th className="p-3">Status</th><th className="p-3 w-48"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className={`border-t border-zinc-800 ${p.isActive ? '' : 'opacity-60'} ${selected.has(p.id) ? 'bg-amber-400/5' : ''}`}>
                <td className="p-3"><input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-amber-400" /></td>
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
                    <button onClick={() => archive(p)} disabled={busy === p.id} className="text-red-400 hover:text-red-300 text-xs font-bold disabled:opacity-50">{busy === p.id ? 'Archiving…' : '🗄 Archive'}</button>
                  ) : (
                    <button onClick={() => reactivate(p)} disabled={busy === p.id} className="text-emerald-400 hover:text-emerald-300 text-xs font-bold disabled:opacity-50">{busy === p.id ? 'Reactivating…' : '↩ Reactivate'}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="p-6 text-center text-zinc-500 text-sm">{archivedCount > 0 && !showArchived ? 'All products are archived. Tick "Show archived" to see them.' : 'No products yet.'}</p>}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Bulk actions apply to products. Archiving also hides each product&rsquo;s variants. Price and stock are changed per product, or by CSV import.</p>
    </div>
  );
}
