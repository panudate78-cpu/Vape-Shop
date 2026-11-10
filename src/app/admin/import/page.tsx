'use client';
import { useState } from 'react';

type Result = {
  ok: boolean;
  updated: number;
  created: number;
  total: number;
  updatedProducts?: number;
  createdCategories?: number;
  errors?: string[];
} | { error: string };

export default function ImportPage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setUploading(true);
    setResult(null);
    setShowErrors(false);
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
          Upload a CSV to bulk-create or update products and variants. Required columns:{' '}
          <code className="text-amber-300">sku</code> (updates existing variant),{' '}
          <code className="text-amber-300">barcode</code> (optional EAN/UPC, must be unique — used by POS scanner),{' '}
          <code className="text-amber-300">product_name</code> (creates a new product if SKU not found).
          Optional columns: <code className="text-amber-300">brand, category, description, images, cost_price, flavor, nicotine_strength, bottle_size, color, stock, price, low_stock_threshold, is_active</code>.
        </p>
        <ul className="text-xs text-zinc-500 list-disc pl-5 space-y-1 mt-2">
          <li><b className="text-zinc-300">Multi-variant products</b> (different flavours / colours / nic strengths): repeat <code>product_name</code> on every row.</li>
          <li><b className="text-zinc-300">description</b> only needs to be on the first row of a product. Raw hex colour codes (like #14b8a6) are stripped automatically.</li>
          <li><b className="text-zinc-300">images</b> — pipe-separated URLs, e.g. <code>https://...a.jpg|https://...b.jpg</code>. First URL = main image. Upload images via the product editor first, then copy URLs here.</li>
          <li><b className="text-zinc-300">cost_price</b> — your wholesale/supplier cost in GBP, never shown to customers (for margin/profit reporting).</li>
          <li><b className="text-zinc-300">category</b> is case-insensitive and auto-created if it doesn't exist.</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-4">
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
          <div className="space-y-3">
            <div className={`rounded-lg border p-3 text-sm ${result.errors && result.errors.length > 0 ? 'bg-amber-500/10 border-amber-400/40 text-amber-200' : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'}`}>
              ✅ Processed <b>{result.total}</b> row{result.total === 1 ? '' : 's'}:
              {' '}<b>{result.updated}</b> variant{result.updated === 1 ? '' : 's'} updated,{' '}
              <b>{result.created}</b> variant{result.created === 1 ? '' : 's'} created
              {typeof result.updatedProducts === 'number' && result.updatedProducts > 0 && <>, {result.updatedProducts} product{result.updatedProducts === 1 ? '' : 's'} updated</>}
              {typeof result.createdCategories === 'number' && result.createdCategories > 0 && <>, {result.createdCategories} new categor{result.createdCategories === 1 ? 'y' : 'ies'} auto-created</>}.
              {result.errors && result.errors.length > 0 && <> <b className="ml-1">{result.errors.length} row{result.errors.length === 1 ? '' : 's'} had errors</b> (see below).</>}
            </div>
            {result.errors && result.errors.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowErrors((s) => !s)} className="text-xs font-bold text-red-300 underline">
                  {showErrors ? 'Hide' : 'Show'} {result.errors.length} row error{result.errors.length === 1 ? '' : 's'}
                </button>
                {showErrors && (
                  <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-xs text-red-200 space-y-1 font-mono">
                    {result.errors.slice(0, 20).map((e, i) => <li key={i}>• {e}</li>)}
                    {result.errors.length > 20 && <li className="text-red-400">… and {result.errors.length - 20} more.</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-3">
        <h2 className="font-semibold text-white">Download CSV template</h2>
        <p className="text-sm text-zinc-400">
          Blank template with the correct column headers plus a few example rows (an e-liquid, a pod kit, coils, batteries). Open in Excel/Sheets, replace the examples with your stock, save as CSV, then upload above.
        </p>
        <a
          href="/admin/import/template.csv"
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600"
        >
          ⬇ Download template.csv
        </a>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-3">
        <h2 className="font-semibold text-white">Export current inventory</h2>
        <p className="text-sm text-zinc-400">
          Downloads a CSV of every product variant currently in the database (SKU, brand, product, flavor, nicotine, size, stock, price). Use this to make bulk edits, then re-import.
        </p>
        <a
          href="/api/admin/export"
          className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-300"
        >
          ⬇ Download inventory.csv
        </a>
      </div>
    </div>
  );
}
