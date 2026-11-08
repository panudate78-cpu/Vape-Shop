'use client';
import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/format';

export default function InventoryPage() {
  const [rows, setRows] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const load = async () => { const r = await fetch('/api/admin/inventory', { cache: 'no-store' }); setRows(await r.json()); setLoading(false); };
  useEffect(() => { load(); }, []);
  const update = async (id: number, patch: any) => {
    await fetch('/api/admin/inventory', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...patch }) });
    load();
  };
  if (loading) return <div className="text-zinc-400">Loading…</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold text-amber-400">Inventory</h1>
      <p className="text-sm text-zinc-400">Update stock, prices, and thresholds inline. Changes save immediately.</p>
      <div className="card p-0 overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-left"><tr>
            <th className="p-2">SKU</th><th className="p-2">Product</th><th className="p-2">Variant</th>
            <th className="p-2">Price £</th><th className="p-2">Stock</th><th className="p-2">Low @</th><th className="p-2">Active</th>
          </tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="border-t border-zinc-800">
                <td className="p-2 font-mono text-xs">{v.sku}</td>
                <td className="p-2"><div className="font-medium">{v.productName}</div><div className="text-xs text-zinc-500">{v.brand}</div></td>
                <td className="p-2 text-zinc-400">{[v.flavor, v.nicotineStrength, v.bottleSize].filter(Boolean).join(' · ')}</td>
                <td className="p-2"><input type="number" step="0.01" defaultValue={Number(v.priceOverride ?? 0)} onBlur={(e) => update(v.id, { priceOverride: e.target.value })} className="input w-24 py-1" /></td>
                <td className="p-2"><input type="number" defaultValue={v.stockQuantity} onBlur={(e) => update(v.id, { stockQuantity: e.target.value })} className={`input w-20 py-1 ${v.stockQuantity <= v.lowStockThreshold ? 'border-amber-500' : ''}`} /></td>
                <td className="p-2"><input type="number" defaultValue={v.lowStockThreshold} onBlur={(e) => update(v.id, { lowStockThreshold: e.target.value })} className="input w-16 py-1" /></td>
                <td className="p-2"><input type="checkbox" defaultChecked={v.isActive} onChange={(e) => update(v.id, { isActive: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
