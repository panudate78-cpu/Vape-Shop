'use client';
import { useState } from 'react';

type Result = { ok: boolean; updated: number; created: number; total: number } | { error: string };

export default function ImportPage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setUploading(true);
    setResult(null);
    try {
      const text = await f.text();
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error || `Upload failed (${res.status})` });
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setResult({ error: err?.message || 'Network error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-400">CSV Import / Export</h1>
        <p className="text-sm text-zinc-400 mt-2">
          Upload a CSV to bulk-create or update product variants. Required columns:{' '}
          <code className="text-teal-300">sku</code> (updates existing),{' '}
          <code className="text-teal-300">product_name</code> (creates new product if SKU not found).
          Optional columns: <code className="text-teal-300">brand, flavor, nicotine_strength, bottle_size, color, stock, price, low_stock_threshold, is_active</code>.
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold text-white">Import inventory</h2>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={upload}
          disabled={uploading}
          className="text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-amber-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black hover:file:bg-amber-300 disabled:opacity-50"
        />
        {fileName && <p className="text-xs text-zinc-500">File: {fileName}</p>}

        {uploading && <p className="text-sm text-amber-300">Uploading…</p>}

        {result && 'error' in result && (
          <p className="text-sm text-red-400">❌ {result.error}</p>
        )}
        {result && 'ok' in result && (
          <div className="rounded-lg bg-teal-900/40 border border-teal-700/50 p-3 text-sm text-teal-200">
            ✅ Import complete — processed <b>{result.total}</b> row(s):{' '}
            <b>{result.updated}</b> updated, <b>{result.created}</b> created.
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-white">Export current inventory</h2>
        <p className="text-sm text-zinc-400">
          Downloads a CSV of every product variant currently in the database (SKU, brand, product, flavor, nicotine, size, stock, price). Use this to make bulk edits, then re-import.
        </p>
        <a
          href="/api/admin/export"
          className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-black hover:bg-teal-400"
        >
          ⬇ Download inventory.csv
        </a>
      </div>
    </div>
  );
}
