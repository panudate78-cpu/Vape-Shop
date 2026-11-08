'use client';
import { useState } from 'react';

export default function ImportPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text();
    setMsg(`Loaded CSV (${text.length} bytes) — to wire this up to real inventory upserts, edit src/app/api/admin/import. (You can currently use /api/admin/export to download current stock.)`);
  };
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-amber-400">Import inventory</h1>
      <p className="text-sm text-zinc-400 mt-1">Upload a CSV (sku, brand, product, flavor, nicotine, size, stock, price). The upsert endpoint is stubbed — wire it up before bulk-importing real data.</p>
      <div className="card mt-4"><input type="file" accept=".csv" onChange={upload} />{msg && <p className="text-sm text-teal-300 mt-3">{msg}</p>}</div>
    </div>
  );
}
