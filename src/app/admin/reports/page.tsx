'use client';
import { useEffect, useState, useCallback } from 'react';
import { gbp } from '@/lib/format';
import { mondayOf, londonToday } from '@/lib/reports/london';

// Owner reports. Figures come from /api/admin/reports. Profit, cost and cost valuation are shown to the owner only.
type Money = number;
type Report = {
  period: { from: string; to: string };
  summary: { orders: number; grossSales: Money; discounts: Money; salesIncVat: Money; refunds: Money; netSalesIncVat: Money; vatOnNetSales: Money; netSalesExVat: Money; tillReturns: number };
  channels: Record<'online' | 'instore', { orders: number; sales: Money; refunds: Money; net: Money }>;
  payments: { key: string; label: string; receipts: Money; refunds: Money; net: Money }[];
  cash: { cashNet: Money; cardNet: Money };
  bestSellers: Record<'product' | 'brand' | 'flavour' | 'strength', { name: string; unitsSold: number; unitsReturned: number; unitsNet: number; netSales: Money }[]>;
  discounts: { orders: number; total: Money; managerApproved: number };
  returns: { count: number; total: Money; byReason: { reason: string; count: number; total: Money }[] };
  tax: { standardRate: number; rows: { rate: number; netSales: Money; vat: Money; grossSales: Money }[]; shipping: Money; shippingRefunded: Money; vatOnNetSales: Money };
  staff: { name: string; sales: number; salesTotal: Money; discountsGiven: Money; managerApprovedDiscounts: number; returns: number; returnsTotal: Money; netTotal: Money }[];
  cashShifts: { rows: { id: number; register: string; openedBy: string | null; closedBy: string | null; openingFloat: Money; cashSales: Money; cashRefunds: Money; paidIn: Money; paidOut: Money; expectedCash: Money | null; calculatedExpected: Money; expectedMatchesRecord: boolean | null; countedCash: Money | null; variance: Money | null; note: string | null; closedAt: string | null }[]; count: number; openNow: number; totalVariance: Money; shiftsWithVariance: number };
  stock: { units: number; retailValue: Money; costValue?: Money; variantsWithoutCost?: number; lowStock: { sku: string; product: string; flavour: string; strength: string; stock: number; threshold: number }[]; slowMoving: { sku: string; product: string; flavour: string; strength: string; stock: number; lastSold: string | null; daysSinceSale: number | null; valueAtCost: Money | null }[]; slowDays: number };
  profit: null | { costOfGoodsSold: Money; grossProfit: Money; grossMarginPct: number | null; complete: boolean; unitsSold: number; unitsWithCost: number; costCoveragePct: number | null; estimatedCostLines: number; missingCostLines: number; missingCostUnits: number; definition: string };
  viewer: { role: string; canSeeProfit: boolean };
  today: string;
};
type TaxConfig = { standardRate: number; categories: { id: number; name: string; taxRate: number }[]; note: string };

type Preset = 'today' | 'week' | 'month' | 'custom';
const REASON: Record<string, string> = { damaged: 'Damaged', faulty: 'Faulty', wrong_item: 'Wrong item', not_as_described: 'Not as described', changed_mind: 'Changed mind', cancelled_order: 'Cancelled order', other: 'Other' };

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-black ${tone === 'warn' ? 'text-amber-300' : tone === 'good' ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
function Table({ head, rows, empty }: { head: string[]; rows: (string | number | null)[][]; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
          <tr>{head.map((h, i) => <th key={i} className={`p-3 ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800 text-zinc-200">
              {r.map((c, j) => <td key={j} className={`p-3 ${j > 0 ? 'text-right' : 'font-medium text-white'}`}>{c ?? '—'}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={head.length} className="p-6 text-center text-zinc-500">{empty || 'Nothing in this period.'}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
const money = (n: number | null | undefined) => (n == null ? '—' : n < 0 ? `−${gbp(Math.abs(n))}` : gbp(n));
const pctText = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`);
const Section = ({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) => (
  <section className="space-y-2">
    <h2 className="text-sm font-black uppercase tracking-wider text-amber-400">{title}</h2>
    {note && <p className="text-xs text-zinc-500">{note}</p>}
    {children}
  </section>
);

export default function ReportsPage() {
  const today = londonToday();
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bestTab, setBestTab] = useState<'product' | 'brand' | 'flavour' | 'strength'>('product');
  const [tax, setTax] = useState<TaxConfig | null>(null);
  const [taxMsg, setTaxMsg] = useState<string | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true); setErr(null);
    const r = await fetch(`/api/admin/reports?from=${f}&to=${t}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error || 'Could not load the report.'); else setData(j);
    setLoading(false);
  }, []);

  useEffect(() => { load(from, to); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    fetch('/api/admin/tax', { cache: 'no-store' }).then(async (r) => { if (r.ok) setTax(await r.json()); });
  }, []);

  const choose = (p: Preset) => {
    setPreset(p);
    if (p === 'today') { setFrom(today); setTo(today); load(today, today); }
    if (p === 'week') { const m = mondayOf(today); setFrom(m); setTo(today); load(m, today); }
    if (p === 'month') { const m = today.slice(0, 8) + '01'; setFrom(m); setTo(today); load(m, today); }
  };
  const applyCustom = () => { setPreset('custom'); load(from, to); };

  const exportQs = `from=${data?.period.from ?? from}&to=${data?.period.to ?? to}`;
  const owner = data?.viewer.canSeeProfit;

  const saveTax = async (body: unknown) => {
    setTaxMsg(null);
    const r = await fetch('/api/admin/tax', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setTaxMsg(j.error || 'Could not save');
    else { setTaxMsg('Saved. Reports now use the new rates.'); fetch('/api/admin/tax').then(async (x) => setTax(await x.json())); load(from, to); }
  };

  return (
    <div className="space-y-8 text-zinc-100">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {(['today', 'week', 'month'] as Preset[]).map((p) => (
            <button key={p} onClick={() => choose(p)} className={`rounded-xl px-3 py-2 text-sm font-bold ${preset === p ? 'bg-amber-400 text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}>
              {p === 'today' ? 'Today' : p === 'week' ? 'This week' : 'This month'}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs text-zinc-400">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-white" /></label>
          <button onClick={applyCustom} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/20">Custom range</button>
        </div>
        {loading && <span className="text-xs text-zinc-500">Loading…</span>}
        {data && owner && (
          <div className="ml-auto flex gap-2 text-sm">
            <a className="rounded-xl bg-white/5 px-3 py-2 text-zinc-300 hover:bg-white/10" href={`/api/admin/xero?${exportQs}`}>Xero sales CSV</a>
            <a className="rounded-xl bg-white/5 px-3 py-2 text-zinc-300 hover:bg-white/10" href={`/api/admin/quickbooks?${exportQs}`}>QuickBooks CSV</a>
            <a className="rounded-xl bg-white/5 px-3 py-2 text-zinc-300 hover:bg-white/10" href={`/api/admin/sage?${exportQs}`}>Sage CSV</a>
          </div>
        )}
      </div>

      {err && <div className="rounded-xl bg-red-900/40 p-4 text-sm font-bold text-red-200">{err}</div>}
      {!data && !err && <div className="text-zinc-400 text-sm">Loading report…</div>}

      {data && (
        <>
          <p className="text-xs text-zinc-500">
            Period {data.period.from}{data.period.to !== data.period.from ? ` to ${data.period.to}` : ''} (London dates). Figures include VAT unless marked “ex VAT”.
            Refunds count on the day they were made.
          </p>

          <Section title="Summary">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card label="Net sales (inc VAT)" value={money(data.summary.netSalesIncVat)} sub={`${data.summary.orders} sales, ${data.summary.tillReturns} till returns`} />
              <Card label="Gross sales" value={money(data.summary.grossSales)} sub="before discounts" />
              <Card label="Discounts" value={money(data.summary.discounts)} sub={`${data.discounts.orders} orders, ${data.discounts.managerApproved} manager-approved`} />
              <Card label="Refunds & returns" value={money(-data.summary.refunds)} sub={`${data.returns.count} refund${data.returns.count === 1 ? '' : 's'}`} />
              {owner && data.profit && <>
                <Card label="Net sales ex VAT" value={money(data.summary.netSalesExVat)} />
                <Card label="Gross profit (ex VAT)" value={money(data.profit.grossProfit)} sub={data.profit.complete ? `Margin ${pctText(data.profit.grossMarginPct)}` : 'Incomplete: some products have no cost'} tone={data.profit.complete ? 'good' : 'warn'} />
                <Card label="Cost of goods sold" value={money(data.profit.costOfGoodsSold)} sub={`Cost known for ${pctText(data.profit.costCoveragePct)} of units`} />
              </>}
            </div>
          </Section>

          <Section title="Online vs in-store">
            <Table head={['Channel', 'Sales', 'Refunds', 'Net']} rows={[
              ['In-store (till)', `${data.channels.instore.orders} · ${money(data.channels.instore.sales)}`, money(-data.channels.instore.refunds), money(data.channels.instore.net)],
              ['Online', `${data.channels.online.orders} · ${money(data.channels.online.sales)}`, money(-data.channels.online.refunds), money(data.channels.online.net)],
            ]} />
          </Section>

          <Section title="Cash and card" note="Card at the till is recorded when the card was taken on a separate terminal. Online card payments are shown separately.">
            <Table head={['Method', 'Taken', 'Refunded', 'Net']} rows={data.payments.map((p) => [p.label, money(p.receipts), money(-p.refunds), money(p.net)])} />
            <div className="grid grid-cols-2 gap-3 md:w-2/3">
              <Card label="Cash net (till + cash on collection)" value={money(data.cash.cashNet)} />
              <Card label="Card net (till + online)" value={money(data.cash.cardNet)} />
            </div>
          </Section>

          <Section title="Best sellers" note="Net of returns and refunds. Revenue includes VAT.">
            <div className="flex gap-2">
              {(['product', 'brand', 'flavour', 'strength'] as const).map((k) => (
                <button key={k} onClick={() => setBestTab(k)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${bestTab === k ? 'bg-amber-400 text-black' : 'bg-white/5 text-zinc-300'}`}>
                  {({ product: 'Product', brand: 'Brand', flavour: 'Flavour', strength: 'Strength' } as const)[k]}
                </button>
              ))}
            </div>
            <Table head={['Name', 'Sold', 'Returned', 'Net units', 'Net sales']}
              rows={data.bestSellers[bestTab].map((b) => [b.name, b.unitsSold, b.unitsReturned, b.unitsNet, money(b.netSales)])} />
          </Section>

          <Section title="Returns and refunds">
            <Table head={['Reason', 'Count', 'Amount']} rows={data.returns.byReason.map((r) => [REASON[r.reason] || r.reason, r.count, money(-r.total)])} empty="No refunds in this period." />
          </Section>

          <Section title="Staff sales" note="Till sales and till returns by the staff member who rang them.">
            <Table head={['Staff', 'Sales', 'Sales total', 'Discounts', 'Returns', 'Returns total', 'Net']}
              rows={data.staff.map((s) => [s.name, s.sales, money(s.salesTotal), money(s.discountsGiven), s.returns, money(s.returnsTotal), money(s.netTotal)])} />
          </Section>

          <Section title="Cash reconciliation" note="Expected = opening float + cash sales − cash refunds + paid in − paid out. Variance = counted − expected.">
            <div className="text-sm text-zinc-400">{data.cashShifts.count} shift{data.cashShifts.count === 1 ? '' : 's'} closed · {data.cashShifts.shiftsWithVariance} with a variance · total variance {money(data.cashShifts.totalVariance)} · {data.cashShifts.openNow} open now</div>
            <Table head={['Register', 'Closed by', 'Float', 'Cash sales', 'Cash refunds', 'Paid in', 'Paid out', 'Expected', 'Counted', 'Variance']}
              rows={data.cashShifts.rows.map((s) => [
                s.register, s.closedBy, money(s.openingFloat), money(s.cashSales), money(s.cashRefunds), money(s.paidIn), money(s.paidOut),
                money(s.expectedCash ?? s.calculatedExpected), money(s.countedCash), s.variance == null ? '—' : s.variance === 0 ? 'Balanced' : money(s.variance),
              ])}
              empty="No shifts closed in this period." />
          </Section>

          <Section title="Stock" note={`Current stock, as of now. Slow-moving = in stock with no sale for ${data.stock.slowDays}+ days.`}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card label="Units in stock" value={String(data.stock.units)} />
              <Card label="Retail value" value={money(data.stock.retailValue)} sub="at selling price" />
              {owner && data.stock.costValue != null && <Card label="Stock value at cost" value={money(data.stock.costValue)} sub={data.stock.variantsWithoutCost ? `${data.stock.variantsWithoutCost} lines with no cost` : 'all lines costed'} tone={data.stock.variantsWithoutCost ? 'warn' : undefined} />}
              <Card label="Low stock lines" value={String(data.stock.lowStock.length)} />
            </div>
            <h3 className="pt-2 text-xs font-bold text-zinc-400">Low stock</h3>
            <Table head={['SKU', 'Product', 'Flavour', 'Strength', 'Stock', 'Threshold']} rows={data.stock.lowStock.map((l) => [l.sku, l.product, l.flavour, l.strength, l.stock, l.threshold])} empty="Nothing is low on stock." />
            <h3 className="pt-2 text-xs font-bold text-zinc-400">Slow-moving</h3>
            <Table head={['SKU', 'Product', 'Flavour', 'Stock', 'Last sold', 'Days', ...(owner ? ['Value at cost'] : [])]}
              rows={data.stock.slowMoving.map((s) => [s.sku, s.product, s.flavour, s.stock, s.lastSold ?? 'never', s.daysSinceSale, ...(owner ? [money(s.valueAtCost)] : [])])}
              empty="No slow-moving stock." />
          </Section>

          <Section title="Tax" note={`VAT is taken out of VAT-inclusive prices at each product's category rate. Shipping is taxed at the standard rate (${data.tax.standardRate}%). Check the breakdown with your accountant before filing.`}>
            <Table head={['VAT rate', 'Net sales ex VAT', 'VAT', 'Gross sales inc VAT']} rows={data.tax.rows.map((t) => [`${t.rate}%`, money(t.netSales), money(t.vat), money(t.grossSales)])} empty="No sales in this period." />
            <p className="text-xs text-zinc-500">Total VAT on net sales: {money(data.tax.vatOnNetSales)}.</p>
          </Section>

          {owner && data.profit && (
            <Section title="Gross profit (owner only)" note={data.profit.definition}>
              <Table head={['Measure', 'Value']} rows={[
                ['Net sales ex VAT', money(data.summary.netSalesExVat)],
                ['Cost of goods sold', money(data.profit.costOfGoodsSold)],
                ['Gross profit', money(data.profit.grossProfit)],
                ['Gross margin', pctText(data.profit.grossMarginPct)],
                ['Units sold', data.profit.unitsSold],
                ['Units with a known cost', `${data.profit.unitsWithCost} (${pctText(data.profit.costCoveragePct)})`],
                ['Lines using current cost (sold before cost was recorded)', data.profit.estimatedCostLines],
                ['Lines with no cost', data.profit.missingCostLines],
              ]} />
              {!data.profit.complete && <p className="text-xs text-amber-300">Gross profit is incomplete: add a cost price to the products listed as having no cost, then the next sales will be costed. Units sold without a cost are counted as zero cost.</p>}
            </Section>
          )}

          {owner && tax && (
            <Section title="VAT rates (owner only)" note={tax.note}>
              <TaxEditor tax={tax} onSave={saveTax} message={taxMsg} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function TaxEditor({ tax, onSave, message }: { tax: TaxConfig; onSave: (body: unknown) => void; message: string | null }) {
  const [standard, setStandard] = useState(String(tax.standardRate));
  const [rates, setRates] = useState<Record<number, string>>(() => Object.fromEntries(tax.categories.map((c) => [c.id, String(c.taxRate)])));
  useEffect(() => {
    setStandard(String(tax.standardRate));
    setRates(Object.fromEntries(tax.categories.map((c) => [c.id, String(c.taxRate)])));
  }, [tax]);
  const changed = tax.categories.filter((c) => Number(rates[c.id]) !== c.taxRate).map((c) => ({ id: c.id, taxRate: Number(rates[c.id]) }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-400">Standard rate %<input type="number" step="0.01" min={0} max={100} value={standard} onChange={(e) => setStandard(e.target.value)} className="mt-1 block w-28 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-white" /></label>
        <button onClick={() => onSave({ standardRate: Number(standard) })} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/20">Save standard rate</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-zinc-500"><tr><th className="p-3">Category</th><th className="p-3 text-right">VAT %</th></tr></thead>
          <tbody>
            {tax.categories.map((c) => (
              <tr key={c.id} className="border-t border-zinc-800">
                <td className="p-3 text-white">{c.name}</td>
                <td className="p-3 text-right"><input type="number" step="0.01" min={0} max={100} value={rates[c.id] ?? ''} onChange={(e) => setRates({ ...rates, [c.id]: e.target.value })} className="w-24 rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-1 text-right text-sm text-white" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={!changed.length} onClick={() => onSave({ categories: changed })} className="rounded-xl bg-amber-400 px-3 py-2 text-sm font-bold text-black disabled:opacity-40">Save category rates</button>
        {message && <span className="text-xs text-zinc-300">{message}</span>}
      </div>
    </div>
  );
}
