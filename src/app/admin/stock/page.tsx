'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gbp } from '@/lib/format';

type Row = {
  variantId: number; sku: string; barcode: string | null; name: string; brand: string;
  price: number; cost: number; costSource: string; marginPct: number | null;
  stock: number; reserved: number; available: number; threshold: number;
  supplierId: number | null; supplierName: string | null; leadTime: number;
  sold30: number; avgDaily: number; onOrder: number; lowStock: boolean; reorderPoint: number; suggestedReorder: number; valueCost: number;
};
type Report = {
  totals: { units: number; valueCost: number; valueRetail: number; potentialMarginPct: number | null; revenue30: number; grossMargin30: number; grossMarginPct30: number | null };
  rows: Row[]; lowStock: Row[]; reorder: Row[];
  expiring: { batchId: number; sku: string; product: string; batchCode: string; expiryDate: string; qtyRemaining: number }[];
};
type Supplier = { id: number; name: string; contactName: string | null; email: string | null; phone: string | null; accountRef: string | null; leadTimeDays: number; active: boolean; openPurchaseOrders: number };
type Movement = { id: number; delta: number; qtyBefore: number; qtyAfter: number; reason: string; actor: string; note: string | null; createdAt: string; sku: string; productName: string; flavor: string | null; orderId: number | null; poId: number | null; stocktakeId: number | null };
type Stocktake = { id: number; name: string; kind: string; status: string; startedBy: string | null; startedAt: string; completedBy?: string | null; completedAt: string | null };
type PO = { id: number; poNumber: string; status: string; supplierName: string | null; supplierId: number; createdAt: string };
type PODetail = { purchaseOrder: PO & { notes: string | null; leadTime: number }; lines: { id: number; variantId: number; ordered: number; received: number; outstanding: number; unitCost: string; sku: string; productName: string; flavor: string | null; lineTotal: number }[] };
type Batch = { id: number; batchCode: string; sku: string; productName: string; flavor: string | null; expiryDate: string | null; qtyReceived: number; qtyRemaining: number; unitCost: string | null; receivedAt: string; status: string };

const TABS = ['Overview', 'Adjust', 'Movements', 'Stocktake', 'Purchasing', 'Suppliers', 'Batches & recall'] as const;
type Tab = typeof TABS[number];

const REASON_LABEL: Record<string, string> = {
  sale_online: 'Online sale', sale_till: 'Till sale', return: 'Return', delivery: 'Delivery', damage: 'Damage',
  loss: 'Loss', stock_count: 'Stock count', recall: 'Recall', correction: 'Correction',
};

async function api<T = any>(url: string, opts?: { method?: string; body?: unknown }): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const r = await fetch(url, {
    method: opts?.method || (opts?.body ? 'POST' : 'GET'),
    headers: opts?.body ? { 'content-type': 'application/json' } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID().replace(/-/g, '') : `k${Date.now()}${Math.random().toString(36).slice(2)}`;

export default function StockPage() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [report, setReport] = useState<Report | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const say = (kind: 'ok' | 'err', text: string) => { setMsg({ kind, text }); setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 5000); };

  const loadReport = useCallback(async () => {
    const r = await api<Report>('/api/admin/stock');
    if (r.ok) setReport(r.data as Report); else say('err', r.data.error || 'Could not load stock report');
  }, []);
  const loadSuppliers = useCallback(async () => {
    const r = await api<{ suppliers: Supplier[] }>('/api/admin/stock/suppliers');
    if (r.ok) setSuppliers(r.data.suppliers);
  }, []);

  useEffect(() => { loadReport(); loadSuppliers(); }, [loadReport, loadSuppliers]);
  const refresh = () => { loadReport(); loadSuppliers(); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-extrabold text-white">📦 Stock control</h2>
        <span className="text-xs text-zinc-500">One stock figure for web and till · every change logged</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === t ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{t}</button>
        ))}
      </div>
      {msg && <div className={`rounded-xl px-4 py-2 text-sm font-bold ${msg.kind === 'ok' ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-500/40' : 'bg-red-900/40 text-red-300 border border-red-500/40'}`}>{msg.text}</div>}

      {tab === 'Overview' && <Overview report={report} suppliers={suppliers} onChanged={refresh} say={say} />}
      {tab === 'Adjust' && <Adjust rows={report?.rows || []} say={say} onChanged={refresh} />}
      {tab === 'Movements' && <Movements rows={report?.rows || []} />}
      {tab === 'Stocktake' && <Stocktakes say={say} onChanged={refresh} />}
      {tab === 'Purchasing' && <Purchasing suppliers={suppliers} rows={report?.rows || []} say={say} onChanged={refresh} />}
      {tab === 'Suppliers' && <SupplierList suppliers={suppliers} say={say} onChanged={loadSuppliers} />}
      {tab === 'Batches & recall' && <Batches say={say} onChanged={refresh} />}
    </div>
  );
}

// ---------------------------------------------------------------- Overview
function Overview({ report, suppliers, onChanged, say }: { report: Report | null; suppliers: Supplier[]; onChanged: () => void; say: (k: 'ok' | 'err', t: string) => void }) {
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  if (!report) return <p className="text-zinc-500">Loading…</p>;
  const t = report.totals;

  const patchVariant = async (variantId: number, body: Record<string, unknown>) => {
    const r = await api('/api/admin/stock', { method: 'PATCH', body: { variantId, ...body } });
    if (!r.ok) say('err', r.data.error || 'Save failed'); else onChanged();
  };

  // Group suggested reorders by supplier and raise one draft PO per supplier.
  const draftPOs = async () => {
    setBusy(true);
    const groups = new Map<number, Row[]>();
    for (const r of report.reorder) { if (r.supplierId) groups.set(r.supplierId, [...(groups.get(r.supplierId) || []), r]); }
    if (!groups.size) { setBusy(false); say('err', 'No suggested reorders have a supplier set. Set a supplier on the product row first.'); return; }
    let made = 0;
    for (const [supplierId, rows] of groups) {
      const r = await api('/api/admin/stock/purchase-orders', { body: { action: 'create', supplierId, lines: rows.map((x) => ({ variantId: x.variantId, quantity: x.suggestedReorder, unitCost: x.cost || undefined })), notes: 'Auto-suggested from stock report' } });
      if (r.ok) made++;
    }
    setBusy(false);
    say('ok', `${made} draft purchase order${made !== 1 ? 's' : ''} created — review them in Purchasing.`);
    onChanged();
  };

  const visible = report.rows.filter((r) => !filter || `${r.name} ${r.sku} ${r.barcode ?? ''} ${r.brand}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Units on hand" value={t.units.toLocaleString()} />
        <Card label="Stock value (cost)" value={gbp(t.valueCost)} />
        <Card label="Stock value (retail)" value={gbp(t.valueRetail)} sub={t.potentialMarginPct != null ? `${t.potentialMarginPct}% potential margin` : undefined} />
        <Card label="Gross margin, 30 days" value={gbp(t.grossMargin30)} sub={t.grossMarginPct30 != null ? `${t.grossMarginPct30}% of ${gbp(t.revenue30)} revenue` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="font-extrabold text-white">⚠ Low stock <span className="text-zinc-500 font-normal">({report.lowStock.length})</span></h3>
          <ul className="mt-2 divide-y divide-zinc-800 max-h-64 overflow-y-auto text-sm">
            {report.lowStock.length === 0 && <li className="py-2 text-zinc-500">Nothing at or below its threshold.</li>}
            {report.lowStock.map((r) => (
              <li key={r.variantId} className="py-2 flex justify-between gap-2"><span className="text-white truncate">{r.name}</span><span className="text-red-400 font-bold whitespace-nowrap">{r.available} left · min {r.threshold}</span></li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-white">🛒 Suggested reorders <span className="text-zinc-500 font-normal">({report.reorder.length})</span></h3>
            <button disabled={busy || !report.reorder.length} onClick={draftPOs} className="ml-auto rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-black disabled:opacity-40">Draft POs by supplier</button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Based on 30-day sales, supplier lead time and a 14-day cover. Edit quantities on the Purchasing tab.</p>
          <ul className="mt-2 divide-y divide-zinc-800 max-h-64 overflow-y-auto text-sm">
            {report.reorder.length === 0 && <li className="py-2 text-zinc-500">No reorders needed right now.</li>}
            {report.reorder.map((r) => (
              <li key={r.variantId} className="py-2 flex justify-between gap-2">
                <span className="text-white truncate">{r.name}<span className="block text-[11px] text-zinc-500">{r.supplierName || 'No supplier set'} · {r.avgDaily}/day · {r.available} on hand{r.onOrder ? ` · ${r.onOrder} on order` : ''}</span></span>
                <span className="text-amber-300 font-bold whitespace-nowrap">+{r.suggestedReorder}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {report.expiring.length > 0 && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-400/5 p-4">
          <h3 className="font-extrabold text-amber-200">⏳ Expiring within 60 days</h3>
          <ul className="mt-2 text-sm divide-y divide-zinc-800">
            {report.expiring.map((b) => <li key={b.batchId} className="py-1 flex justify-between"><span className="text-white">{b.product} <span className="text-zinc-500">· {b.sku} · batch {b.batchCode}</span></span><span className="text-amber-300">{b.qtyRemaining} units · {b.expiryDate}</span></li>)}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h3 className="font-extrabold text-white">All stock</h3>
          <input className="input !py-2 text-sm flex-1 min-w-[200px]" placeholder="Filter by name, SKU, barcode, brand" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase text-zinc-500">
              <tr><th className="p-2">Product</th><th className="p-2 text-right">On hand</th><th className="p-2 text-right">Held</th><th className="p-2 text-right">Available</th><th className="p-2 text-right">Price</th><th className="p-2">Unit cost</th><th className="p-2 text-right">Margin</th><th className="p-2 text-right">Value</th><th className="p-2">Supplier</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {visible.map((r) => (
                <tr key={r.variantId} className={r.lowStock ? 'bg-red-500/5' : ''}>
                  <td className="p-2"><span className="text-white">{r.name}</span><span className="block text-[11px] text-zinc-500 font-mono">{r.sku}{r.barcode ? ` · ${r.barcode}` : ''}</span></td>
                  <td className="p-2 text-right text-white">{r.stock}</td>
                  <td className="p-2 text-right text-zinc-400">{r.reserved || '—'}</td>
                  <td className={`p-2 text-right font-bold ${r.lowStock ? 'text-red-400' : 'text-emerald-300'}`}>{r.available}</td>
                  <td className="p-2 text-right text-zinc-300">{gbp(r.price)}</td>
                  <td className="p-2">
                    <input type="number" step="0.01" min={0} defaultValue={r.costSource === 'none' ? '' : r.cost.toFixed(2)} placeholder="—"
                      onBlur={(e) => { const v = e.target.value; if (v !== (r.costSource === 'none' ? '' : r.cost.toFixed(2))) patchVariant(r.variantId, { unitCost: v === '' ? null : Number(v) }); }}
                      className="input !py-1 !px-2 w-24 text-xs" />
                  </td>
                  <td className="p-2 text-right text-zinc-300">{r.marginPct != null ? `${r.marginPct}%` : '—'}</td>
                  <td className="p-2 text-right text-zinc-300">{gbp(r.valueCost)}</td>
                  <td className="p-2">
                    <select defaultValue={r.supplierId ?? ''} onChange={(e) => patchVariant(r.variantId, { supplierId: e.target.value ? Number(e.target.value) : null })} className="input !py-1 !px-2 text-xs max-w-[160px]">
                      <option value="">— none —</option>
                      {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">Valuation uses the unit cost above (updated automatically when a delivery is received). Margin = (price − cost) ÷ price.</p>
      </section>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-2xl font-extrabold text-white mt-1">{value}</p>
      {sub && <p className="text-[11px] text-zinc-400 mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Adjust
function Adjust({ rows, say, onChanged }: { rows: Row[]; say: (k: 'ok' | 'err', t: string) => void; onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Row | null>(null);
  const [reason, setReason] = useState<'delivery' | 'damage' | 'loss' | 'return' | 'correction'>('damage');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return rows.filter((r) => r.barcode === q.trim() || `${r.name} ${r.sku} ${r.barcode ?? ''}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, rows]);

  const onEnter = () => {
    const exact = rows.find((r) => r.barcode === q.trim() || r.sku === q.trim());
    if (exact) { setPick(exact); setQ(''); }
  };

  const submit = async () => {
    if (!pick || busy) return;
    setBusy(true);
    const isCorrection = reason === 'correction';
    const n = parseInt(qty, 10) || 0;
    const body: Record<string, unknown> = { variantId: pick.variantId, reason, note };
    if (isCorrection) body.delta = n; else body.quantity = Math.abs(n);
    if (reason === 'delivery') { if (batch) body.batchCode = batch; if (expiry) body.expiryDate = expiry; if (cost) body.unitCost = Number(cost); }
    const r = await api('/api/admin/stock', { body });
    setBusy(false);
    if (!r.ok) { say('err', r.data.error || 'Adjustment failed'); return; }
    say('ok', `Recorded: ${REASON_LABEL[reason]} ${isCorrection && n > 0 ? '+' : ''}${n} for ${pick.name} (${pick.sku})`);
    setPick(null); setQty('1'); setNote(''); setBatch(''); setExpiry(''); setCost('');
    onChanged();
    inputRef.current?.focus();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <h3 className="font-extrabold text-white">1 · Find the product</h3>
        <input ref={inputRef} autoFocus className="input !text-lg !py-3" placeholder="Scan barcode or type name / SKU, then Enter"
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter()} />
        <ul className="divide-y divide-zinc-800">
          {matches.map((r) => (
            <li key={r.variantId}><button onClick={() => { setPick(r); setQ(''); }} className="w-full py-2 text-left text-sm text-white hover:text-amber-300">{r.name} <span className="text-zinc-500 font-mono text-xs">{r.sku}</span> <span className="text-zinc-400">· {r.available} available</span></button></li>
          ))}
        </ul>
        {pick && <div className="rounded-xl bg-zinc-950 border border-amber-400/40 p-3 text-sm"><p className="text-white font-bold">{pick.name}</p><p className="text-zinc-400 text-xs">{pick.sku} · on hand {pick.stock} · held {pick.reserved} · available {pick.available}</p></div>}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <h3 className="font-extrabold text-white">2 · Record the change</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(['delivery', 'damage', 'loss', 'return', 'correction'] as const).map((r) => (
            <button key={r} onClick={() => setReason(r)} className={`rounded-lg py-2 text-xs font-bold ${reason === r ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}>{REASON_LABEL[r]}</button>
          ))}
        </div>
        <label className="block text-xs text-zinc-400">{reason === 'correction' ? 'Change (+ adds, − removes)' : 'Quantity'}
          <input type="number" className="input mt-1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        {reason === 'delivery' && (
          <div className="grid grid-cols-3 gap-2">
            <input className="input text-sm" placeholder="Batch / lot" value={batch} onChange={(e) => setBatch(e.target.value)} />
            <input type="date" className="input text-sm" value={expiry} onChange={(e) => setExpiry(e.target.value)} title="Expiry date" />
            <input type="number" step="0.01" className="input text-sm" placeholder="Unit cost £" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        )}
        <textarea className="input text-sm" rows={2} placeholder={reason === 'damage' || reason === 'loss' || reason === 'correction' ? 'Why? (required) e.g. dropped, leaking, counted wrong' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} />
        <button onClick={submit} disabled={!pick || busy} className="w-full rounded-xl bg-amber-400 py-3 font-black text-black disabled:opacity-40">{busy ? 'Saving…' : 'Record movement'}</button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Movements
function Movements({ rows }: { rows: Row[] }) {
  const [list, setList] = useState<Movement[]>([]);
  const [reason, setReason] = useState('');
  const [variantId, setVariantId] = useState('');
  useEffect(() => {
    const p = new URLSearchParams();
    if (reason) p.set('reason', reason);
    if (variantId) p.set('variantId', variantId);
    api<{ movements: Movement[] }>(`/api/admin/stock/movements?${p}`).then((r) => { if (r.ok) setList(r.data.movements); });
  }, [reason, variantId]);
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap gap-2 mb-3">
        <select className="input !py-2 text-sm max-w-xs" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
          <option value="">All products</option>
          {rows.map((r) => <option key={r.variantId} value={r.variantId}>{r.name} ({r.sku})</option>)}
        </select>
        <select className="input !py-2 text-sm max-w-xs" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">All reasons</option>
          {Object.entries(REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase text-zinc-500"><tr><th className="p-2">When</th><th className="p-2">Who</th><th className="p-2">Product</th><th className="p-2">Why</th><th className="p-2 text-right">Change</th><th className="p-2 text-right">Stock</th><th className="p-2">Note / ref</th></tr></thead>
          <tbody className="divide-y divide-zinc-800">
            {list.map((m) => (
              <tr key={m.id}>
                <td className="p-2 text-zinc-400 whitespace-nowrap">{new Date(m.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="p-2 text-zinc-300 text-xs">{m.actor}</td>
                <td className="p-2 text-white">{m.productName} <span className="text-zinc-500 text-xs">{m.flavor} · {m.sku}</span></td>
                <td className="p-2"><span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200">{REASON_LABEL[m.reason] || m.reason}</span></td>
                <td className={`p-2 text-right font-bold ${m.delta > 0 ? 'text-emerald-300' : 'text-red-400'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                <td className="p-2 text-right text-zinc-300">{m.qtyBefore} → {m.qtyAfter}</td>
                <td className="p-2 text-xs text-zinc-500">{m.note || ''}{m.orderId ? ` order #${m.orderId}` : ''}{m.poId ? ` PO #${m.poId}` : ''}{m.stocktakeId ? ` count #${m.stocktakeId}` : ''}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-zinc-500">No movements yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Stocktake
function Stocktakes({ say, onChanged }: { say: (k: 'ok' | 'err', t: string) => void; onChanged: () => void }) {
  const [list, setList] = useState<Stocktake[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'full' | 'partial'>('partial');

  const load = useCallback(() => api<{ stocktakes: Stocktake[] }>('/api/admin/stock/stocktakes').then((r) => r.ok && setList(r.data.stocktakes)), []);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    if (name.trim().length < 2) { say('err', 'Name the stocktake, e.g. "Back room – Nov"'); return; }
    const r = await api<{ stocktake: Stocktake }>('/api/admin/stock/stocktakes', { body: { action: 'start', name: name.trim(), kind } });
    if (!r.ok) { say('err', r.data.error || 'Could not start'); return; }
    setName(''); setOpenId(r.data.stocktake.id); load();
  };

  if (openId) return <StocktakeView id={openId} onBack={() => { setOpenId(null); load(); onChanged(); }} say={say} />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <h3 className="font-extrabold text-white">Start a stocktake</h3>
        <input className="input" placeholder="Name e.g. Back room – Nov" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setKind('partial')} className={`rounded-lg py-3 text-left px-3 ${kind === 'partial' ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}><b>Partial</b><span className="block text-xs opacity-80">Scan only the shelves you count. Everything else is left alone.</span></button>
          <button onClick={() => setKind('full')} className={`rounded-lg py-3 text-left px-3 ${kind === 'full' ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}><b>Full</b><span className="block text-xs opacity-80">Every product is listed. Unscanned lines can be set to zero at the end.</span></button>
        </div>
        <button onClick={start} className="w-full rounded-xl bg-amber-400 py-3 font-black text-black">Start stocktake</button>
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="font-extrabold text-white mb-2">Recent</h3>
        <ul className="divide-y divide-zinc-800 text-sm">
          {list.map((s) => (
            <li key={s.id} className="py-2 flex items-center gap-2">
              <div className="flex-1"><p className="text-white">{s.name} <span className="text-zinc-500 text-xs">· {s.kind}</span></p><p className="text-xs text-zinc-500">{new Date(s.startedAt).toLocaleDateString('en-GB')} · {s.startedBy}</p></div>
              <span className={`text-xs font-bold ${s.status === 'open' ? 'text-amber-300' : 'text-emerald-400'}`}>{s.status}</span>
              <button onClick={() => setOpenId(s.id)} className="rounded-lg bg-zinc-800 px-3 py-1 text-xs font-bold text-white">{s.status === 'open' ? 'Continue' : 'View'}</button>
            </li>
          ))}
          {list.length === 0 && <li className="py-2 text-zinc-500">No stocktakes yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function StocktakeView({ id, onBack, say }: { id: number; onBack: () => void; say: (k: 'ok' | 'err', t: string) => void }) {
  const [data, setData] = useState<{ stocktake: Stocktake; lines: { variantId: number; expected: number; counted: number | null; current: number; sku: string; flavor: string | null; productName: string }[] } | null>(null);
  const [scan, setScan] = useState('');
  const [lastScan, setLastScan] = useState<string>('');
  const [zero, setZero] = useState(false);
  const [result, setResult] = useState<{ variance: { sku: string; expected: number; counted: number; delta: number }[]; adjusted: number } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api(`/api/admin/stock/stocktakes?id=${id}`).then((r) => r.ok && setData(r.data as any)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { scanRef.current?.focus(); }, [data?.stocktake.status]);

  const doScan = async () => {
    const code = scan.trim();
    if (!code) return;
    setScan('');
    const r = await api<{ line: { sku: string; name: string; counted: number }; error?: string }>('/api/admin/stock/stocktakes', { body: { action: 'scan', id, barcode: code, sku: code } });
    if (!r.ok) { say('err', r.data.error || 'Not found'); }
    else { setLastScan(`${r.data.line.name} — counted ${r.data.line.counted}`); }
    load();
    scanRef.current?.focus();
  };

  const setCount = async (variantId: number, counted: number) => {
    await api('/api/admin/stock/stocktakes', { body: { action: 'set', id, variantId, counted } });
    load();
  };

  const complete = async () => {
    if (!confirm('Post these counts to stock? Differences become "stock count" movements and cannot be undone (you can correct them with new movements).')) return;
    const r = await api<{ variance: any[]; adjusted: number }>('/api/admin/stock/stocktakes', { body: { action: 'complete', id, zeroUnscanned: zero } });
    if (!r.ok) { say('err', r.data.error || 'Could not complete'); return; }
    setResult({ variance: r.data.variance, adjusted: r.data.adjusted });
    load();
  };

  if (!data) return <p className="text-zinc-500">Loading…</p>;
  const open = data.stocktake.status === 'open';
  const counted = data.lines.filter((l) => l.counted != null);
  const unscanned = data.lines.filter((l) => l.counted == null).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-zinc-400 hover:text-white">← All stocktakes</button>
        <h3 className="font-extrabold text-white">{data.stocktake.name} <span className="text-zinc-500 font-normal text-sm">· {data.stocktake.kind} · {data.stocktake.status}</span></h3>
      </div>

      {open && (
        <section className="rounded-2xl border border-amber-400/40 bg-zinc-900 p-4 space-y-2">
          <p className="text-sm text-zinc-300">Scan each item (one scan = one unit). Type a barcode/SKU and press Enter if you have no scanner.</p>
          <input ref={scanRef} className="input !text-xl !py-4" placeholder="Scan here…" value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doScan()} autoFocus />
          {lastScan && <p className="text-sm text-emerald-300">✓ {lastScan}</p>}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase text-zinc-500"><tr><th className="p-2">Product</th><th className="p-2 text-right">Expected at start</th><th className="p-2 text-right">Counted</th><th className="p-2 text-right">Now</th><th className="p-2 text-right">Difference</th></tr></thead>
            <tbody className="divide-y divide-zinc-800">
              {data.lines.map((l) => {
                const diff = l.counted == null ? null : l.counted - l.current;
                return (
                  <tr key={l.variantId}>
                    <td className="p-2"><span className="text-white">{l.productName} {l.flavor ?? ''}</span><span className="block text-[11px] text-zinc-500 font-mono">{l.sku}</span></td>
                    <td className="p-2 text-right text-zinc-400">{l.expected}</td>
                    <td className="p-2 text-right">
                      {open ? <input type="number" min={0} defaultValue={l.counted ?? ''} placeholder="—" onBlur={(e) => { if (e.target.value !== '' && Number(e.target.value) !== l.counted) setCount(l.variantId, Number(e.target.value)); }} className="input !py-1 w-20 text-right" />
                        : <span className="text-white">{l.counted ?? '—'}</span>}
                    </td>
                    <td className="p-2 text-right text-zinc-400">{l.current}</td>
                    <td className={`p-2 text-right font-bold ${diff == null ? 'text-zinc-600' : diff === 0 ? 'text-emerald-400' : diff > 0 ? 'text-sky-300' : 'text-red-400'}`}>{diff == null ? '—' : diff > 0 ? `+${diff}` : diff}</td>
                  </tr>
                );
              })}
              {data.lines.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-zinc-500">Nothing scanned yet.</td></tr>}
            </tbody>
          </table>
        </section>

        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 h-fit space-y-3 text-sm">
          <p className="text-zinc-300"><b className="text-white">{counted.length}</b> counted · <b className="text-white">{unscanned}</b> not counted</p>
          {open && data.stocktake.kind === 'full' && (
            <label className="flex items-start gap-2 text-xs text-zinc-300"><input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} className="mt-0.5 accent-amber-400" />Set the {unscanned} uncounted products to zero when completing (use only if you have checked the whole shop)</label>
          )}
          {open ? (
            <button onClick={complete} className="w-full rounded-xl bg-emerald-500 py-3 font-black text-black">Complete & post {counted.length ? `${counted.length} count${counted.length > 1 ? 's' : ''}` : ''}</button>
          ) : <p className="text-xs text-zinc-500">Completed {data.stocktake.completedAt ? new Date(data.stocktake.completedAt).toLocaleString('en-GB') : ''} by {data.stocktake.completedBy}</p>}
          {result && (
            <div className="rounded-lg bg-zinc-950 p-3">
              <p className="font-bold text-white">{result.adjusted} stock adjustment{result.adjusted === 1 ? '' : 's'} posted</p>
              <ul className="mt-2 max-h-48 overflow-y-auto text-xs divide-y divide-zinc-800">
                {result.variance.filter((v) => v.delta !== 0).map((v) => <li key={v.sku} className="py-1 flex justify-between"><span className="font-mono text-zinc-400">{v.sku}</span><span className={v.delta > 0 ? 'text-sky-300' : 'text-red-400'}>{v.delta > 0 ? `+${v.delta}` : v.delta}</span></li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Purchasing
function Purchasing({ suppliers, rows, say, onChanged }: { suppliers: Supplier[]; rows: Row[]; say: (k: 'ok' | 'err', t: string) => void; onChanged: () => void }) {
  const [list, setList] = useState<PO[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => api<{ purchaseOrders: PO[] }>('/api/admin/stock/purchase-orders').then((r) => r.ok && setList(r.data.purchaseOrders)), []);
  useEffect(() => { load(); }, [load]);

  if (creating) return <NewPO suppliers={suppliers} rows={rows} say={say} onDone={(id) => { setCreating(false); load(); onChanged(); if (id) setOpenId(id); }} />;
  if (openId) return <PODetailView id={openId} onBack={() => { setOpenId(null); load(); onChanged(); }} say={say} />;

  const statusTone: Record<string, string> = { draft: 'text-zinc-400', sent: 'text-sky-300', part_received: 'text-amber-300', received: 'text-emerald-400', cancelled: 'text-zinc-600' };
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center mb-3"><h3 className="font-extrabold text-white">Purchase orders</h3>
        <button onClick={() => setCreating(true)} disabled={!suppliers.length} className="ml-auto rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-black disabled:opacity-40">+ New purchase order</button></div>
      {!suppliers.length && <p className="text-xs text-amber-300 mb-2">Add a supplier first (Suppliers tab).</p>}
      <ul className="divide-y divide-zinc-800 text-sm">
        {list.map((p) => (
          <li key={p.id} className="py-2 flex items-center gap-3">
            <div className="flex-1"><p className="font-mono text-white">{p.poNumber}</p><p className="text-xs text-zinc-500">{p.supplierName} · {new Date(p.createdAt).toLocaleDateString('en-GB')}</p></div>
            <span className={`text-xs font-bold uppercase ${statusTone[p.status] || ''}`}>{p.status.replace('_', ' ')}</span>
            <button onClick={() => setOpenId(p.id)} className="rounded-lg bg-zinc-800 px-3 py-1 text-xs font-bold text-white">Open</button>
          </li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-zinc-500">No purchase orders yet.</li>}
      </ul>
    </section>
  );
}

function NewPO({ suppliers, rows, say, onDone }: { suppliers: Supplier[]; rows: Row[]; say: (k: 'ok' | 'err', t: string) => void; onDone: (id?: number) => void }) {
  const [supplierId, setSupplierId] = useState<number | ''>(suppliers[0]?.id ?? '');
  const [lines, setLines] = useState<{ variantId: number; name: string; quantity: number; unitCost: number }[]>([]);
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState('');
  const [expected, setExpected] = useState('');
  const matches = q.trim() ? rows.filter((r) => `${r.name} ${r.sku} ${r.barcode ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];

  const add = (r: Row) => {
    if (lines.some((l) => l.variantId === r.variantId)) return;
    setLines([...lines, { variantId: r.variantId, name: r.name, quantity: Math.max(1, r.suggestedReorder), unitCost: r.cost }]);
    setQ('');
  };
  const create = async () => {
    if (!supplierId || !lines.length) { say('err', 'Pick a supplier and at least one product'); return; }
    const r = await api<{ purchaseOrder: PO }>('/api/admin/stock/purchase-orders', { body: { action: 'create', supplierId, notes, expectedAt: expected || null, lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: l.unitCost })) } });
    if (!r.ok) { say('err', r.data.error || 'Could not create'); return; }
    say('ok', `Draft ${r.data.purchaseOrder.poNumber} created`);
    onDone(r.data.purchaseOrder.id);
  };
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center"><h3 className="font-extrabold text-white">New purchase order</h3><button onClick={() => onDone()} className="ml-auto text-sm text-zinc-400 hover:text-white">Cancel</button></div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select className="input" value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value))}>
          {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" className="input" value={expected} onChange={(e) => setExpected(e.target.value)} title="Expected delivery" />
        <input className="input" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <input className="input" placeholder="Add product: name, SKU or barcode" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { e.preventDefault(); add(matches[0]); } }} />
      {matches.length > 0 && <ul className="divide-y divide-zinc-800">{matches.map((r) => <li key={r.variantId}><button onClick={() => add(r)} className="w-full py-2 text-left text-sm text-white hover:text-amber-300">{r.name} <span className="text-zinc-500 text-xs font-mono">{r.sku}</span> <span className="text-zinc-400 text-xs">· suggested {r.suggestedReorder}</span></button></li>)}</ul>}
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase text-zinc-500"><tr><th className="p-2">Product</th><th className="p-2 w-28">Qty</th><th className="p-2 w-28">Unit cost £</th><th className="p-2 text-right">Line</th><th /></tr></thead>
        <tbody className="divide-y divide-zinc-800">
          {lines.map((l, i) => (
            <tr key={l.variantId}>
              <td className="p-2 text-white">{l.name}</td>
              <td className="p-2"><input type="number" min={1} className="input !py-1 w-24" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x))} /></td>
              <td className="p-2"><input type="number" step="0.01" min={0} className="input !py-1 w-24" value={l.unitCost} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unitCost: Number(e.target.value) || 0 } : x))} /></td>
              <td className="p-2 text-right text-zinc-300">{gbp(l.quantity * l.unitCost)}</td>
              <td className="p-2 text-right"><button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-red-400 text-xs">remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3"><p className="text-sm text-zinc-300">Total <b className="text-white">{gbp(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0))}</b></p>
        <button onClick={create} className="ml-auto rounded-xl bg-amber-400 px-5 py-2 font-black text-black">Save as draft</button></div>
    </section>
  );
}

function PODetailView({ id, onBack, say }: { id: number; onBack: () => void; say: (k: 'ok' | 'err', t: string) => void }) {
  const [d, setD] = useState<PODetail | null>(null);
  const [recv, setRecv] = useState<Record<number, { qty: string; batch: string; expiry: string }>>({});
  const [busy, setBusy] = useState(false);
  const setField = (lineId: number, k: 'qty' | 'batch' | 'expiry', v: string) =>
    setRecv((r) => ({ ...r, [lineId]: { ...(r[lineId] ?? { qty: '', batch: '', expiry: '' }), [k]: v } }));
  const load = useCallback(() => api<PODetail>(`/api/admin/stock/purchase-orders?id=${id}`).then((r) => r.ok && setD(r.data)), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (action: 'send' | 'cancel') => {
    const r = await api('/api/admin/stock/purchase-orders', { body: { action, id } });
    if (!r.ok) say('err', r.data.error || 'Failed'); else { say('ok', action === 'send' ? 'Marked as sent to supplier' : 'Purchase order cancelled'); load(); }
  };

  // One receipt key per submit: a double-click or retry can't apply the same delivery twice.
  const receive = async () => {
    if (!d || busy) return;
    const lines = Object.entries(recv).map(([lineId, v]) => ({ lineId: Number(lineId), quantity: parseInt(v.qty, 10) || 0, batchCode: v.batch || null, expiryDate: v.expiry || null }))
      .filter((l) => l.quantity > 0);
    if (!lines.length) { say('err', 'Enter the quantity received on at least one line'); return; }
    setBusy(true);
    const r = await api('/api/admin/stock/purchase-orders', { body: { action: 'receive', id, receiptKey: newKey(), lines } });
    setBusy(false);
    if (!r.ok) { say('err', r.data.error || 'Receiving failed'); return; }
    say('ok', `Received ${lines.reduce((s, l) => s + l.quantity, 0)} units into stock`);
    setRecv({}); load();
  };

  if (!d) return <p className="text-zinc-500">Loading…</p>;
  const po = d.purchaseOrder;
  const canReceive = po.status === 'sent' || po.status === 'part_received';
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="text-sm text-zinc-400 hover:text-white">← Purchase orders</button>
        <h3 className="font-extrabold text-white font-mono">{po.poNumber}</h3>
        <span className="text-sm text-zinc-400">{po.supplierName} · {po.status.replace('_', ' ')}</span>
        <div className="ml-auto flex gap-2">
          {po.status === 'draft' && <button onClick={() => act('send')} className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-black text-black">Mark sent</button>}
          {(po.status === 'draft' || po.status === 'sent') && <button onClick={() => act('cancel')} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-red-300">Cancel</button>}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase text-zinc-500"><tr><th className="p-2">Product</th><th className="p-2 text-right">Ordered</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Outstanding</th><th className="p-2 text-right">Cost</th>{canReceive && <><th className="p-2">Receive now</th><th className="p-2">Batch</th><th className="p-2">Expiry</th></>}</tr></thead>
        <tbody className="divide-y divide-zinc-800">
          {d.lines.map((l) => (
            <tr key={l.id}>
              <td className="p-2 text-white">{l.productName} {l.flavor ?? ''}<span className="block text-[11px] text-zinc-500 font-mono">{l.sku}</span></td>
              <td className="p-2 text-right">{l.ordered}</td>
              <td className="p-2 text-right text-emerald-300">{l.received}</td>
              <td className="p-2 text-right font-bold">{l.outstanding}</td>
              <td className="p-2 text-right text-zinc-400">{gbp(l.unitCost)}</td>
              {canReceive && (
                <>
                  <td className="p-2"><input type="number" min={0} max={l.outstanding} className="input !py-1 w-20" disabled={l.outstanding === 0} placeholder="0"
                    value={recv[l.id]?.qty ?? ''} onChange={(e) => setField(l.id, 'qty', e.target.value)} /></td>
                  <td className="p-2"><input className="input !py-1 w-28" placeholder="auto" value={recv[l.id]?.batch ?? ''} onChange={(e) => setField(l.id, 'batch', e.target.value)} /></td>
                  <td className="p-2"><input type="date" className="input !py-1" value={recv[l.id]?.expiry ?? ''} onChange={(e) => setField(l.id, 'expiry', e.target.value)} /></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canReceive && (
        <div className="flex items-center gap-3">
          <p className="text-xs text-zinc-500">Partial delivery? Enter only what arrived. The rest stays outstanding on the order.</p>
          <button onClick={receive} disabled={busy} className="ml-auto rounded-xl bg-emerald-500 px-5 py-3 font-black text-black disabled:opacity-50">{busy ? 'Receiving…' : 'Receive into stock'}</button>
        </div>
      )}
      {po.notes && <p className="text-xs text-zinc-500">Notes: {po.notes}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- Suppliers
function SupplierList({ suppliers, say, onChanged }: { suppliers: Supplier[]; say: (k: 'ok' | 'err', t: string) => void; onChanged: () => void }) {
  const [form, setForm] = useState({ name: '', contactName: '', email: '', phone: '', accountRef: '', leadTimeDays: '7' });
  const add = async () => {
    const r = await api('/api/admin/stock/suppliers', { body: { ...form, leadTimeDays: Number(form.leadTimeDays) || 0 } });
    if (!r.ok) { say('err', r.data.error || 'Could not save supplier'); return; }
    say('ok', `Supplier ${form.name} added`); setForm({ name: '', contactName: '', email: '', phone: '', accountRef: '', leadTimeDays: '7' }); onChanged();
  };
  const patch = async (s: Supplier, body: Record<string, unknown>) => {
    const r = await api('/api/admin/stock/suppliers', { method: 'PATCH', body: { id: s.id, ...body } });
    if (!r.ok) say('err', r.data.error || 'Save failed'); else onChanged();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase text-zinc-500"><tr><th className="p-2">Supplier</th><th className="p-2">Contact</th><th className="p-2">Lead time (days)</th><th className="p-2 text-right">Open POs</th><th className="p-2">Status</th></tr></thead>
          <tbody className="divide-y divide-zinc-800">
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td className="p-2 text-white">{s.name}<span className="block text-[11px] text-zinc-500">{s.email || ''} {s.phone || ''} {s.accountRef ? `· acct ${s.accountRef}` : ''}</span></td>
                <td className="p-2 text-zinc-400 text-xs">{s.contactName || '—'}</td>
                <td className="p-2"><input type="number" min={0} defaultValue={s.leadTimeDays} onBlur={(e) => Number(e.target.value) !== s.leadTimeDays && patch(s, { leadTimeDays: Number(e.target.value) })} className="input !py-1 w-20" /></td>
                <td className="p-2 text-right">{s.openPurchaseOrders}</td>
                <td className="p-2"><button onClick={() => patch(s, { active: !s.active })} className={`rounded px-2 py-1 text-xs font-bold ${s.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-700 text-zinc-300'}`}>{s.active ? 'Active' : 'Inactive'}</button></td>
              </tr>
            ))}
            {suppliers.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-zinc-500">No suppliers yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
        <h3 className="font-extrabold text-white">Add supplier</h3>
        {(['name', 'contactName', 'email', 'phone', 'accountRef'] as const).map((k) => (
          <input key={k} className="input text-sm" placeholder={({ name: 'Company name', contactName: 'Contact person', email: 'Order email', phone: 'Phone', accountRef: 'Your account number' } as Record<string, string>)[k]} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
        ))}
        <label className="block text-xs text-zinc-400">Typical lead time (days)<input type="number" min={0} className="input mt-1 text-sm" value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} /></label>
        <button onClick={add} disabled={form.name.trim().length < 2} className="w-full rounded-xl bg-amber-400 py-2 font-black text-black disabled:opacity-40">Save supplier</button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Batches
function Batches({ say, onChanged }: { say: (k: 'ok' | 'err', t: string) => void; onChanged: () => void }) {
  const [list, setList] = useState<Batch[]>([]);
  const [recalled, setRecalled] = useState<{ batchCode: string; unitsSoldFromBatch: number; affectedOrders: { orderId: number; createdAt: string; channel: string; email: string | null }[] } | null>(null);
  const load = useCallback(() => api<{ batches: Batch[] }>('/api/admin/stock/batches').then((r) => r.ok && setList(r.data.batches)), []);
  useEffect(() => { load(); }, [load]);

  const recall = async (b: Batch) => {
    const note = prompt(`Recall batch ${b.batchCode} (${b.productName} ${b.flavor ?? ''})?\nRemaining ${b.qtyRemaining} units will be removed from stock.\nReason (required):`);
    if (!note || note.trim().length < 3) return;
    const r = await api<any>('/api/admin/stock/batches', { body: { batchId: b.id, note: note.trim() } });
    if (!r.ok) { say('err', r.data.error || 'Recall failed'); return; }
    setRecalled(r.data); say('ok', `Batch ${b.batchCode} recalled`); load(); onChanged();
  };

  const tone: Record<string, string> = { ok: 'text-emerald-300', expiring: 'text-amber-300', expired: 'text-red-400', recalled: 'text-red-400 line-through', used: 'text-zinc-600', no_expiry: 'text-zinc-400' };
  return (
    <div className="space-y-4">
      {recalled && (
        <section className="rounded-2xl border border-red-500/50 bg-red-500/5 p-4">
          <div className="flex items-center"><h3 className="font-extrabold text-red-200">Recall {recalled.batchCode}: {recalled.unitsSoldFromBatch} units had already sold from this batch</h3><button onClick={() => setRecalled(null)} className="ml-auto text-xs text-zinc-400">dismiss</button></div>
          {recalled.affectedOrders.length === 0 ? <p className="text-sm text-zinc-400 mt-2">No orders are linked to this batch (it may have been received before batch tracking).</p> : (
            <ul className="mt-2 text-sm divide-y divide-zinc-800">
              {recalled.affectedOrders.map((o) => <li key={o.orderId} className="py-1 flex justify-between"><span className="text-white">Order #{o.orderId} · {o.channel}</span><span className="text-zinc-300">{o.email || 'walk-in / no email'}</span></li>)}
            </ul>
          )}
        </section>
      )}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase text-zinc-500"><tr><th className="p-2">Product</th><th className="p-2">Batch</th><th className="p-2">Expiry</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Remaining</th><th className="p-2">Status</th><th /></tr></thead>
          <tbody className="divide-y divide-zinc-800">
            {list.map((b) => (
              <tr key={b.id}>
                <td className="p-2 text-white">{b.productName} {b.flavor ?? ''}<span className="block text-[11px] text-zinc-500 font-mono">{b.sku}</span></td>
                <td className="p-2 font-mono text-xs text-zinc-300">{b.batchCode}</td>
                <td className="p-2 text-zinc-300">{b.expiryDate || '—'}</td>
                <td className="p-2 text-right text-zinc-400">{b.qtyReceived}</td>
                <td className="p-2 text-right text-white">{b.qtyRemaining}</td>
                <td className={`p-2 text-xs font-bold uppercase ${tone[b.status] || ''}`}>{b.status.replace('_', ' ')}</td>
                <td className="p-2 text-right">{b.status !== 'recalled' && b.status !== 'used' && <button onClick={() => recall(b)} className="rounded bg-red-500/15 px-2 py-1 text-xs font-bold text-red-300">Recall</button>}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-zinc-500">No batches yet. Batches are created when stock is received.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
