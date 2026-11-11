'use client';
import { useCallback, useEffect, useState } from 'react';

type Change = { field: string; from: string | null; to: string | null };
type ChangeRow = { row: number; ref: string; sku: string | null; action: 'create' | 'update' | 'unchanged' | 'reject'; kind: string; changes: Change[]; message: string | null };
type Result = {
  ok: true; mode: 'preview' | 'apply'; total: number; created: number; updated: number; unchanged: number; rejected: number;
  updatedProducts?: number; createdCategories?: number; rowErrors: { row: number; ref: string; message: string }[];
  changes: ChangeRow[]; rejectedCsv: string | null; errors: string[];
} | { error: string };

type HistoryEntry = { id: number; at: string; actorName: string | null; detail: any };

const ACTION_BADGE: Record<string, string> = {
  create: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
  update: 'bg-sky-500/20 text-sky-200 border-sky-400/40',
  unchanged: 'bg-zinc-700/40 text-zinc-300 border-zinc-500/40',
  reject: 'bg-red-500/20 text-red-200 border-red-400/40',
};
const ACTION_LABEL: Record<string, string> = { create: 'New', update: 'Update', unchanged: 'No change', reject: 'Rejected' };
const fmtDate = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function ImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [applied, setApplied] = useState<Result | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [openRun, setOpenRun] = useState<number | null>(null);

  const loadHistory = useCallback(async () => {
    const r = await fetch('/api/admin/audit?action=import.apply&limit=20', { cache: 'no-store' });
    if (r.ok) setHistory((await r.json()).entries || []);
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const send = async (text: string, name: string, mode: 'preview' | 'apply'): Promise<Result> => {
    const res = await fetch(`/api/admin/import?mode=${mode}&filename=${encodeURIComponent(name)}`, {
      method: 'POST', headers: { 'content-type': 'text/csv' }, body: text,
    });
    const data = await res.json().catch(() => ({ error: `Upload failed (${res.status})` }));
    if (!res.ok && !('error' in data)) return { error: `Upload failed (${res.status})` };
    return data;
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name); setApplied(null); setPreview(null); setBusy('preview');
    try {
      const text = await f.text();
      setFileText(text);
      setPreview(await send(text, f.name, 'preview'));
    } catch (err: any) {
      setPreview({ error: err?.message || 'Could not read the file' });
    } finally { setBusy(null); }
  };

  const apply = async () => {
    if (!fileText || !fileName || !preview || !('ok' in preview)) return;
    const valid = preview.created + preview.updated;
    if (!valid) return;
    const msg = `Apply ${valid} change${valid === 1 ? '' : 's'} (${preview.created} new, ${preview.updated} updated)?` +
      (preview.rejected ? `\n\n${preview.rejected} row${preview.rejected === 1 ? '' : 's'} will be skipped.` : '') +
      '\n\nThis writes to the live inventory. It cannot be undone from this page.';
    if (!confirm(msg)) return;
    setBusy('apply');
    try {
      const r = await send(fileText, fileName, 'apply');
      setApplied(r);
      if ('ok' in r) setPreview(null);
      loadHistory();
    } catch (err: any) {
      setApplied({ error: err?.message || 'Network error' });
    } finally { setBusy(null); }
  };

  const reset = () => { setFileName(null); setFileText(null); setPreview(null); setApplied(null); };

  const summary = (r: Extract<Result, { ok: true }>, label: string) => (
    <div className={`rounded-lg border p-3 text-sm ${r.rejected ? 'bg-amber-500/10 border-amber-400/40 text-amber-200' : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'}`}>
      <b>{label}</b> {r.total} row{r.total === 1 ? '' : 's'}: <b>{r.created}</b> new, <b>{r.updated}</b> updated, <b>{r.unchanged}</b> with no change, <b>{r.rejected}</b> rejected.
      {typeof r.updatedProducts === 'number' && r.updatedProducts > 0 && <> {r.updatedProducts} product{r.updatedProducts === 1 ? '' : 's'} changed.</>}
      {typeof r.createdCategories === 'number' && r.createdCategories > 0 && <> {r.createdCategories} categor{r.createdCategories === 1 ? 'y' : 'ies'} {r.mode === 'preview' ? 'will be created' : 'created'}.</>}
    </div>
  );

  const p = preview && 'ok' in preview ? preview : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-400">CSV Import / Export</h1>
        <p className="text-sm text-zinc-400 mt-2">
          Upload a CSV to create or update products and variants. The file is checked first and nothing changes until you press <b className="text-zinc-200">Apply</b>.
          Required columns: <code className="text-amber-300">sku</code> (updates an existing variant),{' '}
          <code className="text-amber-300">product_name</code> (creates a new product if the SKU is not found).
          Optional columns: <code className="text-amber-300">brand, category, description, images, cost_price, flavor, nicotine_strength, bottle_size, color, stock, price, low_stock_threshold, is_active, barcode</code>.
        </p>
        <ul className="text-xs text-zinc-500 list-disc pl-5 space-y-1 mt-2">
          <li><b className="text-zinc-300">A blank cell never changes existing data.</b> It only fills a value for a new product or variant. To change a value, put it in the cell.</li>
          <li><b className="text-zinc-300">Multi-variant products</b> (different flavours / colours / nic strengths): repeat <code>product_name</code> on every row.</li>
          <li><b className="text-zinc-300">images</b> — https:// links separated by <code>|</code>. First link = main image. Plain http links are rejected.</li>
          <li><b className="text-zinc-300">price, cost_price</b> — e.g. <code>14.99</code> or <code>£14.99</code>. <b className="text-zinc-300">stock, low_stock_threshold</b> — whole numbers, 0 or more. <b className="text-zinc-300">barcode</b> — 8 to 14 digits.</li>
          <li><b className="text-zinc-300">cost_price</b> — your wholesale/supplier cost, never shown to customers.</li>
          <li><b className="text-zinc-300">category</b> is case-insensitive and auto-created if it doesn't exist.</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-4">
        <h2 className="font-semibold text-white">1. Choose a file</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            disabled={busy !== null}
            className="text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-amber-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black hover:file:bg-amber-300 disabled:opacity-50"
          />
          {fileName && <button type="button" onClick={reset} className="text-xs text-zinc-400 underline">Clear</button>}
        </div>
        {fileName && <p className="text-xs text-zinc-500">File: {fileName}</p>}
        {busy === 'preview' && <p className="text-sm text-amber-300">Checking the file…</p>}
        {preview && 'error' in preview && <p className="text-sm text-red-400">❌ {preview.error}</p>}

        {p && (
          <div className="space-y-3">
            <h2 className="font-semibold text-white">2. Review what will change</h2>
            {summary(p, 'Preview:')}

            <div className="flex flex-wrap gap-3">
              {p.rejectedCsv && (
                <button type="button" onClick={() => downloadCsv(`${(fileName || 'import').replace(/\.csv$/i, '')}-corrections.csv`, p.rejectedCsv!)}
                  className="rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
                  ⬇ Download corrections ({p.rejected} row{p.rejected === 1 ? '' : 's'})
                </button>
              )}
              <button type="button" onClick={apply} disabled={busy !== null || p.created + p.updated === 0}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-extrabold text-black hover:bg-amber-300 disabled:opacity-40">
                {busy === 'apply' ? 'Applying…' : `Apply ${p.created + p.updated} change${p.created + p.updated === 1 ? '' : 's'}`}
              </button>
            </div>

            <div className="max-h-96 overflow-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-900 text-left uppercase tracking-wide text-zinc-500">
                  <tr><th className="p-2">Row</th><th className="p-2">Item</th><th className="p-2">Status</th><th className="p-2">What changes</th></tr>
                </thead>
                <tbody>
                  {p.changes.map((c) => (
                    <tr key={c.row} className="border-t border-white/5 align-top">
                      <td className="p-2 text-zinc-400">{c.row}</td>
                      <td className="p-2"><div className="font-mono text-zinc-200">{c.sku || '(no SKU)'}</div><div className="text-zinc-500">{c.ref !== c.sku ? c.ref : ''}</div></td>
                      <td className="p-2"><span className={`rounded border px-2 py-0.5 font-bold ${ACTION_BADGE[c.action]}`}>{ACTION_LABEL[c.action]}</span><div className="mt-1 text-zinc-500">{c.kind}</div></td>
                      <td className="p-2">
                        {c.action === 'reject' && <span className="text-red-300">{c.message}</span>}
                        {c.action === 'unchanged' && <span className="text-zinc-500">Already matches the file.</span>}
                        {(c.action === 'create' || c.action === 'update') && (
                          <ul className="space-y-0.5">
                            {c.changes.map((ch, i) => (
                              <li key={i} className="text-zinc-300">
                                <span className="text-zinc-500">{ch.field}:</span>{' '}
                                {ch.from !== null && <><span className="line-through text-zinc-500">{ch.from}</span> → </>}
                                <span className="text-zinc-100">{ch.to ?? '(cleared)'}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {p.changes.length === 0 && <p className="text-xs text-zinc-500">Nothing in this file changes the current inventory.</p>}
          </div>
        )}

        {applied && 'error' in applied && <p className="text-sm text-red-400">❌ {applied.error}</p>}
        {applied && 'ok' in applied && (
          <div className="space-y-2">
            <h2 className="font-semibold text-white">3. Applied</h2>
            {summary(applied, 'Done:')}
            {applied.rejectedCsv && (
              <button type="button" onClick={() => downloadCsv(`${(fileName || 'import').replace(/\.csv$/i, '')}-corrections.csv`, applied.rejectedCsv!)}
                className="rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
                ⬇ Download corrections ({applied.rejected})
              </button>
            )}
            {applied.rowErrors.length > 0 && (
              <ul className="max-h-48 overflow-y-auto rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-xs text-red-200 space-y-1 font-mono">
                {applied.rowErrors.slice(0, 50).map((e, i) => <li key={i}>• Row {e.row} ({e.ref}): {e.message}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-3">
        <h2 className="font-semibold text-white">Import history</h2>
        <p className="text-xs text-zinc-500">Each applied import with what changed. Previews are not recorded.</p>
        {history.length === 0 && <p className="text-sm text-zinc-500">No imports applied yet.</p>}
        <ul className="divide-y divide-white/5">
          {history.map((h) => {
            const d = h.detail || {};
            const open = openRun === h.id;
            return (
              <li key={h.id} className="py-2">
                <button type="button" onClick={() => setOpenRun(open ? null : h.id)} className="w-full text-left">
                  <div className="text-sm text-zinc-200">
                    <span className="font-semibold">{d.filename || 'import'}</span>{' '}
                    <span className="text-xs text-zinc-500">· {fmtDate(h.at)} · {h.actorName || 'staff'}</span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {d.created ?? 0} new, {d.updated ?? 0} updated, {d.unchanged ?? 0} no change, {d.rejected ?? 0} rejected {open ? '▲' : '▼'}
                  </div>
                </button>
                {open && (
                  <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-white/10 p-2 text-xs">
                    {(d.changes || []).length === 0 && <p className="text-zinc-500">No row-level detail.</p>}
                    {(d.changes || []).map((c: any, i: number) => (
                      <div key={i} className="border-b border-white/5 py-1">
                        <span className={`mr-2 rounded border px-1.5 py-0.5 font-bold ${ACTION_BADGE[c.action] || ''}`}>{ACTION_LABEL[c.action] || c.action}</span>
                        <span className="font-mono text-zinc-200">{c.sku || c.ref}</span> <span className="text-zinc-500">row {c.row}</span>
                        {c.action === 'reject' && <div className="text-red-300">{c.message}</div>}
                        {(c.changes || []).map((ch: Change, j: number) => (
                          <div key={j} className="text-zinc-400 pl-2">{ch.field}: {ch.from !== null && <span className="line-through">{ch.from}</span>}{ch.from !== null ? ' → ' : ''}<span className="text-zinc-200">{ch.to ?? '(cleared)'}</span></div>
                        ))}
                      </div>
                    ))}
                    {d.truncated && <p className="pt-2 text-zinc-500">Only the first 2,000 rows are kept in the history.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-3">
        <h2 className="font-semibold text-white">Download CSV template</h2>
        <p className="text-sm text-zinc-400">
          Blank template with the correct column headers plus a few example rows (an e-liquid, a pod kit, coils, batteries). Open in Excel/Sheets, replace the examples with your stock, save as CSV, then upload above.
        </p>
        <a href="/admin/import/template.csv" className="inline-flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600">
          ⬇ Download template.csv
        </a>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-3">
        <h2 className="font-semibold text-white">Export current inventory</h2>
        <p className="text-sm text-zinc-400">
          Downloads a CSV of every product variant currently in the database (SKU, brand, product, flavor, nicotine, size, stock, price). Use this to make bulk edits, then re-import.
        </p>
        <a href="/api/admin/export" className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-300">
          ⬇ Download inventory.csv
        </a>
      </div>
    </div>
  );
}
