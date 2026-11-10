'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PRODUCT_KINDS, ID_TYPES, REFUSAL_REASONS } from '@/lib/compliance-rules';

type Issues = { violations: string[]; missing: string[]; warnings: string[] };
type Variant = {
  id: number; productId: number; sku: string; flavor: string; nicotineStrength: string; bottleSize: string;
  productKind: string; deviceType: string; compatibility: string; vgPg: string | null; productVgPg: string | null;
  ageRestricted: boolean; isActive: boolean; productName: string; brand: string;
  record: any; documents: any[]; issues: Issues; blocks: any[];
};
type Tab = 'Products' | 'Blocks & recalls' | 'Refusal log' | 'Age checks';
const TABS: Tab[] = ['Products', 'Blocks & recalls', 'Refusal log', 'Age checks'];

async function api<T = any>(url: string, opts?: { method?: string; body?: unknown }): Promise<{ ok: boolean; status: number; d: T & { error?: string } }> {
  const r = await fetch(url, { method: opts?.method || (opts?.body ? 'POST' : 'GET'), headers: opts?.body ? { 'content-type': 'application/json' } : undefined, body: opts?.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const field = 'rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white w-full';
const label = 'block text-xs font-bold text-zinc-300 mb-1';

export default function CompliancePage() {
  const [tab, setTab] = useState<Tab>('Products');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const say = (kind: 'ok' | 'err', text: string) => { setMsg({ kind, text }); setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 6000); };
  const [variants, setVariants] = useState<Variant[]>([]);
  const [kinds, setKinds] = useState<Record<string, string>>(PRODUCT_KINDS as any);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    const r = await api('/api/admin/compliance/products');
    if (r.status === 403) { setForbidden(true); return; }
    if (!r.ok) { say('err', r.d.error || 'Could not load compliance data'); return; }
    setVariants(r.d.variants); if (r.d.kinds) setKinds(r.d.kinds);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (forbidden) return <p className="text-zinc-400">Compliance tools are for the owner and managers.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white">🛡 Compliance</h2>
          <p className="text-xs text-zinc-400">Product classification, product rules, blocks and recalls, refusal and age-check logs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-xl px-3 py-2 text-sm font-bold ${tab === t ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-xs text-zinc-400">
        These tools record the shop&rsquo;s checks and hold the evidence. They do not make the shop compliant on their own. Check the current law and guidance (Nicotine Inhaling Products (Age of Sale and Proxy Purchasing) Regulations 2015, Tobacco and Vapes Act 2026, Tobacco and Related Products Regulations 2016) with Trading Standards or a solicitor.
      </div>
      {msg && <div className={`rounded-xl px-4 py-2 text-sm font-bold ${msg.kind === 'ok' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'}`}>{msg.text}</div>}

      {tab === 'Products' && <ProductsTab variants={variants} kinds={kinds} reload={load} say={say} />}
      {tab === 'Blocks & recalls' && <BlocksTab variants={variants} say={say} reload={load} />}
      {tab === 'Refusal log' && <AgeLogTab result="refused" say={say} />}
      {tab === 'Age checks' && <AgeLogTab result="" say={say} />}
    </div>
  );
}

function IssueList({ issues }: { issues: Issues }) {
  const any = issues.violations.length + issues.missing.length + issues.warnings.length;
  if (!any) return <span className="text-xs font-bold text-emerald-300">Complete</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {issues.violations.map((x, i) => <li key={'v' + i} className="text-red-300 font-bold">✖ {x}</li>)}
      {issues.missing.map((x, i) => <li key={'m' + i} className="text-amber-300">• {x}</li>)}
      {issues.warnings.map((x, i) => <li key={'w' + i} className="text-zinc-400">◦ {x}</li>)}
    </ul>
  );
}

function ProductsTab({ variants, kinds, reload, say }: { variants: Variant[]; kinds: Record<string, string>; reload: () => void; say: (k: 'ok' | 'err', t: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'todo' | 'violations'>('all');
  const shown = useMemo(() => variants.filter((v) => filter === 'all' ? true : filter === 'violations' ? v.issues.violations.length > 0 : (v.issues.missing.length + v.issues.violations.length) > 0), [variants, filter]);
  const counts = useMemo(() => ({
    todo: variants.filter((v) => v.issues.missing.length > 0 || v.issues.violations.length > 0).length,
    violations: variants.filter((v) => v.issues.violations.length > 0).length,
  }), [variants]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <button onClick={() => setFilter('all')} className={`rounded-xl px-3 py-1.5 font-bold ${filter === 'all' ? 'bg-zinc-200 text-black' : 'bg-zinc-800 text-zinc-300'}`}>All ({variants.length})</button>
        <button onClick={() => setFilter('todo')} className={`rounded-xl px-3 py-1.5 font-bold ${filter === 'todo' ? 'bg-zinc-200 text-black' : 'bg-zinc-800 text-zinc-300'}`}>To do ({counts.todo})</button>
        <button onClick={() => setFilter('violations')} className={`rounded-xl px-3 py-1.5 font-bold ${filter === 'violations' ? 'bg-red-300 text-black' : 'bg-zinc-800 text-red-300'}`}>Cannot sell ({counts.violations})</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="p-3">Product</th><th className="p-3">Type</th><th className="p-3">Age-restricted</th><th className="p-3">Strength / size</th><th className="p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {shown.map((v) => (
              <Fragment key={v.id}>
                <tr key={v.id} className="border-t border-white/5 align-top">
                  <td className="p-3"><div className="font-bold text-white">{v.productName}</div><div className="text-xs text-zinc-400">{v.sku} · {v.flavor}</div>{v.blocks.length > 0 && <div className="mt-1 text-xs font-bold text-red-300">{v.blocks[0].kind === 'recall' ? 'RECALLED' : 'STOP-SALE'}: {v.blocks[0].reason}</div>}</td>
                  <td className="p-3 text-zinc-200">{kinds[v.productKind] || v.productKind}{v.deviceType ? <div className="text-xs text-zinc-400">{v.deviceType}</div> : null}</td>
                  <td className="p-3">{v.ageRestricted ? <span className="font-bold text-amber-300">Yes · 18+</span> : <span className="text-zinc-400">No</span>}</td>
                  <td className="p-3 text-zinc-200">{v.nicotineStrength} · {v.bottleSize || '—'}{v.record?.tankMl ? <div className="text-xs text-zinc-400">tank {v.record.tankMl}ml</div> : null}</td>
                  <td className="p-3 max-w-md"><IssueList issues={v.issues} /></td>
                  <td className="p-3"><button onClick={() => setOpen(open === v.id ? null : v.id)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/5">{open === v.id ? 'Close' : 'Edit'}</button></td>
                </tr>
                {open === v.id && (
                  <tr key={'e' + v.id} className="bg-zinc-950"><td colSpan={6} className="p-4"><ProductEditor v={v} kinds={kinds} onSaved={() => { reload(); say('ok', 'Saved.'); }} onError={(t) => say('err', t)} /></td></tr>
                )}
              </Fragment>
            ))}
            {!shown.length && <tr><td colSpan={6} className="p-8 text-center text-zinc-500">Nothing to show.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">Missing details are to-dos. Recorded violations (for example nicotine above 20mg/ml, a banned single-use vape, a tank above 2ml) stop sales at the till and online.</p>
    </div>
  );
}

function ProductEditor({ v, kinds, onSaved, onError }: { v: Variant; kinds: Record<string, string>; onSaved: () => void; onError: (t: string) => void }) {
  const r = v.record || {};
  const [productKind, setKind] = useState(v.productKind);
  const [deviceType, setDeviceType] = useState(v.deviceType || '');
  const [compatibility, setCompat] = useState(v.compatibility || '');
  const [vgPg, setVgPg] = useState(v.vgPg || v.productVgPg || '');
  const [ageRestricted, setAgeRestricted] = useState(v.ageRestricted);
  const [mhra, setMhra] = useState(r.mhraNotificationRef || '');
  const [batch, setBatch] = useState(r.batchNumber || '');
  const [nic, setNic] = useState(r.nicotineMgMl ?? '');
  const [bottle, setBottle] = useState(r.bottleMl ?? '');
  const [tank, setTank] = useState(r.tankMl ?? '');
  const [child, setChild] = useState(!!r.childResistant);
  const [tamper, setTamper] = useState(!!r.tamperEvident);
  const [labelChecked, setLabelChecked] = useState(false);
  const [supplier, setSupplier] = useState(r.supplierName || '');
  const [notes, setNotes] = useState(r.notes || '');
  const [busy, setBusy] = useState(false);
  const [docTitle, setDocTitle] = useState(''); const [docUrl, setDocUrl] = useState(''); const [docKind, setDocKind] = useState('mhra_notification'); const [docExp, setDocExp] = useState('');
  const num = (x: any) => (x === '' || x === null || x === undefined ? null : Number(x));

  const save = async () => {
    setBusy(true);
    const { ok, d } = await api(`/api/admin/compliance/products/${v.id}`, { method: 'PUT', body: {
      productKind, deviceType, compatibility, vgPg: vgPg || null, ageRestricted,
      record: { mhraNotificationRef: mhra || null, batchNumber: batch || null, nicotineMgMl: num(nic), bottleMl: num(bottle), tankMl: num(tank), childResistant: child, tamperEvident: tamper, labelChecked, supplierName: supplier || null, notes },
    } });
    setBusy(false);
    if (!ok) { onError(d.error || 'Could not save'); return; }
    onSaved();
  };
  const addDoc = async () => {
    const { ok, d } = await api('/api/admin/compliance/documents', { body: { variantId: v.id, supplierName: supplier || undefined, kind: docKind, title: docTitle, url: docUrl, expiresAt: docExp || undefined } });
    if (!ok) { onError(d.error || 'Could not add the document'); return; }
    setDocTitle(''); setDocUrl(''); setDocExp(''); onSaved();
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <h3 className="font-extrabold text-white">Product type</h3>
        <div><label className={label}>Type (keep refillable devices, pods, coils and liquids separate)</label>
          <select className={field} value={productKind} onChange={(e) => setKind(e.target.value)}>{Object.entries(kinds).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Device type</label><input className={field} value={deviceType} onChange={(e) => setDeviceType(e.target.value)} placeholder="pod kit, refillable tank…" /></div>
          <div><label className={label}>VG/PG</label><input className={field} value={vgPg} onChange={(e) => setVgPg(e.target.value)} placeholder="70/30" /></div>
        </div>
        <div><label className={label}>Compatible with</label><input className={field} value={compatibility} onChange={(e) => setCompat(e.target.value)} placeholder="devices or coils this fits" /></div>
        <label className="flex items-center gap-2 text-sm text-zinc-200"><input type="checkbox" checked={ageRestricted} onChange={(e) => setAgeRestricted(e.target.checked)} /> Age-restricted (18+ check at sale and handover)</label>
        <h3 className="pt-2 font-extrabold text-white">Product rules</h3>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={label}>Nicotine mg/ml</label><input className={field} type="number" step="0.1" value={nic} onChange={(e) => setNic(e.target.value)} /></div>
          <div><label className={label}>Container ml</label><input className={field} type="number" step="0.1" value={bottle} onChange={(e) => setBottle(e.target.value)} /></div>
          <div><label className={label}>Tank ml</label><input className={field} type="number" step="0.1" value={tank} onChange={(e) => setTank(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>MHRA notification ref</label><input className={field} value={mhra} onChange={(e) => setMhra(e.target.value)} /></div>
          <div><label className={label}>Batch number</label><input className={field} value={batch} onChange={(e) => setBatch(e.target.value)} /></div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-zinc-200">
          <label className="flex items-center gap-2"><input type="checkbox" checked={child} onChange={(e) => setChild(e.target.checked)} /> Child-resistant</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={tamper} onChange={(e) => setTamper(e.target.checked)} /> Tamper-evident</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={labelChecked} onChange={(e) => setLabelChecked(e.target.checked)} /> Label checked today{r.labelCheckedAt ? ` (last: ${fmt(r.labelCheckedAt)} by ${r.labelCheckedBy})` : ''}</label>
        </div>
        <div><label className={label}>Supplier</label><input className={field} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
        <div><label className={label}>Notes</label><input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></div>
        <button disabled={busy} onClick={save} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-black disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="space-y-3">
        <h3 className="font-extrabold text-white">Supplier documents</h3>
        <p className="text-xs text-zinc-400">Link to the file in the supplier&rsquo;s or your own storage (https only). Files uploaded here would not persist on the server.</p>
        <ul className="space-y-1 text-sm">
          {v.documents.map((d: any) => (
            <li key={d.id} className="flex flex-wrap justify-between gap-2"><a className="text-amber-300 underline" href={d.url} target="_blank" rel="noreferrer">{d.title}</a><span className="text-xs text-zinc-400">{d.kind.replace(/_/g, ' ')}{d.expiresAt ? ` · expires ${new Date(d.expiresAt).toLocaleDateString('en-GB')}` : ''}</span></li>
          ))}
          {!v.documents.length && <li className="text-zinc-500">No documents linked.</li>}
        </ul>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <select className={field} value={docKind} onChange={(e) => setDocKind(e.target.value)}>
            <option value="mhra_notification">MHRA notification</option><option value="safety_data_sheet">Safety data sheet</option>
            <option value="test_report">Test report</option><option value="label_proof">Label proof</option>
            <option value="supplier_invoice">Supplier invoice</option><option value="other">Other</option>
          </select>
          <input className={field} type="date" value={docExp} onChange={(e) => setDocExp(e.target.value)} aria-label="Expiry date" />
          <input className={`${field} col-span-2`} placeholder="Title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
          <input className={`${field} col-span-2`} placeholder="https://…" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} />
          <button disabled={!docTitle || !docUrl} onClick={addDoc} className="col-span-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-white hover:bg-white/5 disabled:opacity-40">Add document link</button>
        </div>
      </div>
    </div>
  );
}

function BlocksTab({ variants, say, reload }: { variants: Variant[]; say: (k: 'ok' | 'err', t: string) => void; reload: () => void }) {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [kind, setKind] = useState<'block' | 'recall'>('block');
  const [scope, setScope] = useState<'variant' | 'product'>('variant');
  const [variantId, setVariantId] = useState('');
  const [productId, setProductId] = useState('');
  const [reason, setReason] = useState('');
  const [affected, setAffected] = useState<any[] | null>(null);
  const [liftFor, setLiftFor] = useState<number | null>(null);
  const [liftReason, setLiftReason] = useState('');

  const products = useMemo(() => Array.from(new Map(variants.map((v) => [v.productId, v.productName])).entries()), [variants]);
  const load = useCallback(async () => { const r = await api('/api/admin/compliance/blocks'); if (r.ok) setBlocks(r.d); }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const body: any = { kind, scope, reason };
    if (scope === 'variant') body.variantId = Number(variantId); else body.productId = Number(productId);
    const { ok, d } = await api('/api/admin/compliance/blocks', { body });
    if (!ok) { say('err', d.error || 'Could not save'); return; }
    say('ok', kind === 'recall' ? `Recall recorded. ${d.affectedCount} order(s) contain this product.` : 'Stop-sale recorded.');
    setAffected(kind === 'recall' ? (d.affectedOrders || []) : null);
    setReason(''); load(); reload();
  };
  const lift = async (id: number) => {
    const { ok, d } = await api(`/api/admin/compliance/blocks/${id}`, { method: 'PATCH', body: { action: 'lift', reason: liftReason } });
    if (!ok) { say('err', d.error || 'Could not lift'); return; }
    say('ok', 'Block lifted. The record is kept.'); setLiftFor(null); setLiftReason(''); load(); reload();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 space-y-3">
        <h3 className="font-extrabold text-white">Stop-sale or recall</h3>
        <p className="text-xs text-zinc-400">A stop-sale stops new online and till sales. A recall does the same and lists the orders that contain the product so you can contact those customers. Returns of these products are still allowed. Automatic recall emails are not sent yet.</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as any)}><option value="block">Stop-sale</option><option value="recall">Recall</option></select>
          <select className={field} value={scope} onChange={(e) => setScope(e.target.value as any)}><option value="variant">One variant</option><option value="product">Whole product</option></select>
          {scope === 'variant'
            ? <select className={field} value={variantId} onChange={(e) => setVariantId(e.target.value)}><option value="">Choose variant…</option>{variants.map((v) => <option key={v.id} value={v.id}>{v.productName} · {v.sku}</option>)}</select>
            : <select className={field} value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Choose product…</option>{products.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>}
          <input className={field} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </div>
        <button disabled={!reason.trim() || (scope === 'variant' ? !variantId : !productId)} onClick={create} className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-40">Record {kind === 'recall' ? 'recall' : 'stop-sale'}</button>
      </div>

      {affected && (
        <div className="rounded-2xl border border-red-400/40 bg-zinc-900 p-4">
          <h3 className="font-extrabold text-white mb-2">Orders to contact ({affected.length})</h3>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-500"><tr><th className="py-1">Order</th><th>Placed</th><th>Customer</th><th>Payment</th><th>Fulfilment</th></tr></thead>
            <tbody>{affected.map((o) => (<tr key={o.id} className="border-t border-white/5"><td className="py-1"><Link className="font-bold text-amber-300 underline" href={`/admin/orders/${o.id}`}>#{o.id}</Link></td><td className="text-zinc-300">{fmt(o.createdAt)}</td><td className="text-zinc-200">{o.guestEmail || (o.userId ? `customer #${o.userId}` : '—')}</td><td className="text-zinc-300">{o.paymentStatus}</td><td className="text-zinc-300">{o.fulfilmentStatus}</td></tr>))}</tbody></table></div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
        <h3 className="font-extrabold text-white mb-2">Active blocks and recalls</h3>
        <ul className="divide-y divide-white/5">
          {blocks.filter((b) => b.status === 'active').map((b) => (
            <li key={b.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
              <div><span className={`mr-2 rounded px-2 py-0.5 text-xs font-bold ${b.kind === 'recall' ? 'bg-red-500 text-white' : 'bg-amber-400 text-black'}`}>{b.kind === 'recall' ? 'RECALL' : 'STOP-SALE'}</span><span className="font-bold text-white">{b.productName || b.variantSku}</span> <span className="text-xs text-zinc-400">{b.scope === 'product' ? 'whole product' : 'variant'}</span><div className="text-sm text-zinc-300">{b.reason}</div><div className="text-xs text-zinc-500">{fmt(b.createdAt)} · {b.createdBy}</div></div>
              {liftFor === b.id ? (
                <div className="flex gap-2"><input className={field} placeholder="Why is it safe to sell again?" value={liftReason} onChange={(e) => setLiftReason(e.target.value)} /><button onClick={() => lift(b.id)} disabled={liftReason.trim().length < 5} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-black disabled:opacity-40">Lift</button></div>
              ) : (
                <button onClick={() => setLiftFor(b.id)} className="rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-white hover:bg-white/5">Lift block…</button>
              )}
            </li>
          ))}
          {!blocks.some((b) => b.status === 'active') && <li className="py-3 text-sm text-zinc-500">No active blocks or recalls.</li>}
        </ul>
      </div>
    </div>
  );
}

function AgeLogTab({ result, say }: { result: string; say: (k: 'ok' | 'err', t: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [channel, setChannel] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (result) p.set('result', result);
    if (channel) p.set('channel', channel);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const r = await api(`/api/admin/compliance/age-checks?${p.toString()}`);
    if (!r.ok) { say('err', r.d.error || 'Could not load'); return; }
    setRows(r.d);
  }, [result, channel, from, to, say]);
  useEffect(() => { load(); }, [load]);
  const csv = () => {
    const head = ['at', 'channel', 'result', 'method', 'id_type', 'reason', 'staff', 'order', 'products', 'note'];
    const lines = rows.map((r) => [r.at, r.channel, r.result, r.method, r.idType, REFUSAL_REASONS[r.reasonCode] || r.reasonCode || '', r.staffName, r.orderId ?? r.saleOrderId ?? '', r.productSummary ?? '', r.note ?? ''].map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${result || 'age-checks'}-log.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <select className={field + ' !w-auto'} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All channels</option><option value="till">Till</option><option value="collection">Collection</option><option value="delivery">Delivery</option><option value="online">Online</option></select>
        <input className={field + ' !w-auto'} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input className={field + ' !w-auto'} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <button onClick={load} className="rounded-xl bg-zinc-800 px-3 py-2 text-sm font-bold text-zinc-200">Apply</button>
        <button onClick={csv} disabled={!rows.length} className="rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Export CSV</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500"><tr><th className="p-3">When</th><th className="p-3">Channel</th><th className="p-3">Result</th><th className="p-3">Reason / ID</th><th className="p-3">Staff</th><th className="p-3">Products</th><th className="p-3">Order</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5 align-top">
                <td className="p-3 whitespace-nowrap text-zinc-300">{fmt(r.at)}</td>
                <td className="p-3 text-zinc-200 capitalize">{r.channel}{r.register ? <div className="text-xs text-zinc-500">{r.register}</div> : null}</td>
                <td className="p-3">{r.result === 'refused' ? <span className="font-bold text-red-300">Refused</span> : <span className="font-bold text-emerald-300">Passed</span>}<div className="text-xs text-zinc-500">{({ id_seen: 'ID seen', appearance: 'Appeared over 25', third_party: 'Third-party', dob_declared: 'DOB declared' } as any)[r.method] || r.method}</div></td>
                <td className="p-3 text-zinc-200">{r.reasonCode ? REFUSAL_REASONS[r.reasonCode] || r.reasonCode : (r.idType ? ID_TYPES[r.idType] || r.idType : '—')}{r.note ? <div className="text-xs text-zinc-400">“{r.note}”</div> : null}</td>
                <td className="p-3 text-zinc-200">{r.staffName || (r.channel === 'online' ? 'customer' : '—')}</td>
                <td className="p-3 text-xs text-zinc-300 max-w-xs">{r.productSummary || '—'}</td>
                <td className="p-3">{(r.orderId ?? r.saleOrderId) ? <Link className="text-amber-300 underline" href={`/admin/orders/${r.orderId ?? r.saleOrderId}`}>#{r.orderId ?? r.saleOrderId}</Link> : <span className="text-zinc-500">no sale</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="p-8 text-center text-zinc-500">No records.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
