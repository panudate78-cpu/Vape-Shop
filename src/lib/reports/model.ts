// Owner reporting: the calculation core. Pure functions, no database access, so every figure can be
// tested with fixtures (see /home/user/pgtest tests). The loader (load.ts) fetches rows for a date range
// and hands them here.
//
// Conventions
// - All money is computed in whole pence internally and returned in pounds (2 dp).
// - Prices in the shop are VAT-inclusive. VAT is taken out of the gross amount at the category rate:
//   VAT = gross × rate / (100 + rate).
// - A sale is an order that is not a till return and has been paid (including later partly or fully refunded).
// - Refunds are the order_refunds rows. Till returns also create a return order with a negative total, but
//   those return orders are NOT added again: they are only used for staff and cash figures.
// - Gross profit = net revenue excluding VAT − cost of goods sold. COGS = cost of units sold − cost of
//   units returned to stock (restock = true). Units returned NOT to stock are treated as written off.
// - Cost per line: the snapshot taken at the time of sale; if that is missing (sales made before the
//   snapshot existed), the current cost is used and the line is counted in `estimatedCostLines`.
//   Lines with no cost at all are counted in `missingCostLines` and contribute zero cost; the profit figure
//   is then incomplete and the report says so.

export type SaleOrder = {
  id: number; createdAt: Date; source: string; paymentStatus: string; paymentGateway: string | null;
  paymentMethod: string | null; paymentBreakdown: { method: string; amount: number }[] | null;
  subtotal: number; discount: number; shippingCost: number; total: number;
  parentOrderId: number | null; staffName: string | null; approvedBy: string | null;
  shiftId: number | null; registerId: string | null;
};
export type Item = {
  id: number; orderId: number; variantId: number | null; productName: string; sku: string;
  quantity: number; unitPrice: number; unitCost: number | null;
};
export type Refund = {
  id: number; orderId: number; createdAt: Date; amount: number; method: string; reasonCode: string;
  originSource: string; originGateway: string | null; originPaymentMethod: string | null; originShiftId: number | null;
};
export type RefundLine = { refundId: number; orderItemId: number; quantity: number; amount: number; restock: boolean };
export type VariantInfo = {
  variantId: number; productName: string; brand: string; flavor: string; strength: string;
  categoryRate: number; currentCost: number | null; price: number; stock: number; threshold: number;
  isActive: boolean; sku: string; lastSoldAt: Date | null; productActive: boolean;
};
export type Shift = {
  id: number; register: string; status: string; openedByName: string | null; closedByName: string | null;
  openedAt: Date; closedAt: Date | null; openingFloat: number; expectedCash: number | null;
  countedCash: number | null; variance: number | null; discrepancyNote: string | null;
};
export type CashMovement = { shiftId: number; kind: string; amount: number };

export type ReportInput = {
  sales: SaleOrder[];          // paid sales in range (excluding till returns)
  items: Item[];               // lines of those sales
  refunds: Refund[];           // refunds created in range
  refundLines: RefundLine[];   // lines of those refunds
  returnOrders: SaleOrder[];   // till return orders in range (negative totals), for staff and cash
  shifts: Shift[];             // shifts closed in range
  movements: CashMovement[];   // paid in/out for those shifts
  openShiftCount: number;      // shifts open right now
  variants: VariantInfo[];     // current stock and details
};

export type ReportOptions = {
  from: string; to: string;    // inclusive London dates (YYYY-MM-DD), echoed back
  standardRate: number;        // VAT % for shipping and anything not tied to a category
  slowDays: number;            // no sale for this many days = slow-moving
  now: Date;
  isOwner: boolean;            // cost, profit and cost valuation are owner-only
};

const P = (x: number) => Math.round(x * 100);
const GBP = (p: number) => Math.round(p) / 100;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

type Alloc = { variantId: number | null; itemId: number | null; qty: number; revP: number; rate: number; costP: number | null; estimated: boolean; productName: string };

function variantOf(vi: Map<number, VariantInfo>, id: number | null) {
  return id == null ? undefined : vi.get(id);
}

// Split one sale's goods across its lines so they add up exactly to the order total (less shipping).
function allocateSale(o: SaleOrder, lines: Item[], vi: Map<number, VariantInfo>, std: number): { goods: Alloc[]; shipP: number } {
  const goodsP = P(o.total) - P(o.shippingCost);
  const shipP = P(o.shippingCost);
  const withLen = lines.map((l) => ({ l, lineP: P(l.unitPrice) * l.quantity })).filter((x) => x.l.quantity !== 0);
  const sumL = withLen.reduce((s, x) => s + x.lineP, 0);
  const goods: Alloc[] = [];
  if (withLen.length === 0 || sumL <= 0) {
    if (goodsP !== 0) goods.push({ variantId: null, itemId: null, qty: 0, revP: goodsP, rate: std, costP: null, estimated: false, productName: 'Unitemised sale' });
    return { goods, shipP };
  }
  let used = 0;
  withLen.forEach((x, idx) => {
    const isLast = idx === withLen.length - 1;
    const revP = isLast ? goodsP - used : Math.round((goodsP * x.lineP) / sumL);
    used += revP;
    const v = variantOf(vi, x.l.variantId);
    const rate = v ? v.categoryRate : std;
    let costP: number | null = null; let estimated = false;
    if (x.l.unitCost != null) costP = P(x.l.unitCost);
    else if (v && v.currentCost != null) { costP = P(v.currentCost); estimated = true; }
    goods.push({ variantId: x.l.variantId, itemId: x.l.id, qty: x.l.quantity, revP, rate, costP, estimated, productName: x.l.productName });
  });
  return { goods, shipP };
}

export function computeReport(input: ReportInput, opts: ReportOptions) {
  const std = opts.standardRate;
  const vi = new Map(input.variants.map((v) => [v.variantId, v]));
  const itemById = new Map(input.items.map((i) => [i.id, i]));
  const itemsByOrder = new Map<number, Item[]>();
  for (const it of input.items) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    itemsByOrder.get(it.orderId)!.push(it);
  }

  // ---- sales ----
  const saleAllocs: { order: SaleOrder; goods: Alloc[]; shipP: number }[] = [];
  for (const o of input.sales) {
    const { goods, shipP } = allocateSale(o, itemsByOrder.get(o.id) || [], vi, std);
    saleAllocs.push({ order: o, goods, shipP });
  }

  // ---- refunds ----
  type RAlloc = { refund: Refund; lines: { itemId: number; qty: number; amtP: number; rate: number; restock: boolean; variantId: number | null; costP: number | null; estimated: boolean }[]; residualP: number };
  const rlByRefund = new Map<number, RefundLine[]>();
  for (const rl of input.refundLines) {
    if (!rlByRefund.has(rl.refundId)) rlByRefund.set(rl.refundId, []);
    rlByRefund.get(rl.refundId)!.push(rl);
  }
  const refundAllocs: RAlloc[] = input.refunds.map((r) => {
    const lines = (rlByRefund.get(r.id) || []).map((rl) => {
      const it = itemById.get(rl.orderItemId);
      const v = it ? variantOf(vi, it.variantId) : undefined;
      let costP: number | null = null; let estimated = false;
      if (it?.unitCost != null) costP = P(it.unitCost);
      else if (v && v.currentCost != null) { costP = P(v.currentCost); estimated = true; }
      return { itemId: rl.orderItemId, qty: rl.quantity, amtP: P(rl.amount), rate: v ? v.categoryRate : std, restock: rl.restock, variantId: it?.variantId ?? null, costP, estimated };
    });
    const linesP = lines.reduce((s, l) => s + l.amtP, 0);
    return { refund: r, lines, residualP: P(r.amount) - linesP };
  });

  // ---- revenue and VAT ----
  let grossSalesP = 0, discountP = 0, salesIncP = 0, shippingSoldP = 0, salesVatP = 0, salesNetP = 0;
  let refundsIncP = 0, refundsVatP = 0, refundsNetP = 0, shippingRefundedP = 0;
  const byRate = new Map<number, { netP: number; vatP: number; incP: number }>();
  const addRate = (rate: number, incP: number, vatP: number) => {
    const cur = byRate.get(rate) || { netP: 0, vatP: 0, incP: 0 };
    cur.incP += incP; cur.vatP += vatP; cur.netP += incP - vatP;
    byRate.set(rate, cur);
  };
  const vatOf = (incP: number, rate: number) => Math.round((incP * rate) / (100 + rate));

  for (const { order: o, goods, shipP } of saleAllocs) {
    grossSalesP += P(o.subtotal) + shipP;
    discountP += P(o.discount);
    salesIncP += P(o.total);
    shippingSoldP += shipP;
    for (const g of goods) { const v = vatOf(g.revP, g.rate); salesVatP += v; addRate(g.rate, g.revP, v); }
    if (shipP) { const v = vatOf(shipP, std); salesVatP += v; addRate(std, shipP, v); }
  }
  for (const ra of refundAllocs) {
    refundsIncP += P(ra.refund.amount);
    for (const l of ra.lines) { const v = vatOf(l.amtP, l.rate); refundsVatP += v; addRate(l.rate, -l.amtP, -v); }
    if (ra.residualP) { shippingRefundedP += ra.residualP; const v = vatOf(ra.residualP, std); refundsVatP += v; addRate(std, -ra.residualP, -v); }
  }
  const netSalesIncP = salesIncP - refundsIncP;
  const vatNetP = salesVatP - refundsVatP;
  const revenueExVatP = netSalesIncP - vatNetP;
  salesNetP = salesIncP - salesVatP; refundsNetP = refundsIncP - refundsVatP;

  // ---- cost of goods and gross profit (owner only) ----
  let cogsP = 0, soldUnits = 0, costedUnits = 0, estimatedLines = 0, missingCostLines = 0, missingCostUnits = 0;
  for (const { goods } of saleAllocs) {
    for (const g of goods) {
      if (g.qty === 0) continue;
      soldUnits += g.qty;
      if (g.costP == null) { missingCostLines++; missingCostUnits += g.qty; continue; }
      costedUnits += g.qty;
      if (g.estimated) estimatedLines++;
      cogsP += g.costP * g.qty;
    }
  }
  for (const ra of refundAllocs) for (const l of ra.lines) {
    if (!l.restock) continue;
    if (l.costP == null) continue;
    cogsP -= l.costP * l.qty;
  }
  const grossProfitP = revenueExVatP - cogsP;
  const profitComplete = missingCostLines === 0;

  // ---- best sellers (net of refunds, VAT-inclusive revenue) ----
  type Agg = { key: string; name: string; qtySold: number; qtyReturned: number; netRevP: number };
  const aggs = {
    product: new Map<string, Agg>(), brand: new Map<string, Agg>(), flavour: new Map<string, Agg>(), strength: new Map<string, Agg>(),
  };
  const bump = (m: Map<string, Agg>, key: string, name: string, dq: number, dr: number, dRev: number) => {
    const cur = m.get(key) || { key, name, qtySold: 0, qtyReturned: 0, netRevP: 0 };
    cur.qtySold += dq; cur.qtyReturned += dr; cur.netRevP += dRev; m.set(key, cur);
  };
  const addSeller = (variantId: number | null, productName: string, qtySold: number, qtyRet: number, revP: number) => {
    const v = variantOf(vi, variantId);
    const product = v?.productName || productName || 'Unknown product';
    const brand = v?.brand || '—';
    const flavour = v?.flavor || '—';
    const strength = v?.strength || '—';
    bump(aggs.product, product, product, qtySold, qtyRet, revP);
    bump(aggs.brand, brand, brand, qtySold, qtyRet, revP);
    bump(aggs.flavour, flavour, flavour, qtySold, qtyRet, revP);
    bump(aggs.strength, strength, strength, qtySold, qtyRet, revP);
  };
  for (const { goods } of saleAllocs) for (const g of goods) {
    if (g.qty === 0) continue;
    addSeller(g.variantId, g.productName, g.qty, 0, g.revP);
  }
  for (const ra of refundAllocs) for (const l of ra.lines) {
    const it = itemById.get(l.itemId);
    addSeller(l.variantId, it?.productName || '', 0, l.qty, -l.amtP);
  }
  const toSellers = (m: Map<string, Agg>) => [...m.values()]
    .map((a) => ({ name: a.name, unitsSold: a.qtySold, unitsReturned: a.qtyReturned, unitsNet: a.qtySold - a.qtyReturned, netSales: GBP(a.netRevP) }))
    .sort((x, y) => y.netSales - x.netSales).slice(0, 20);

  // ---- online vs in-store ----
  const channel = (src: string) => (src === 'pos' ? 'instore' : 'online');
  const channels = { online: { sales: 0, salesInc: 0, refunds: 0, net: 0 }, instore: { sales: 0, salesInc: 0, refunds: 0, net: 0 } };
  for (const o of input.sales) { const c = channels[channel(o.source) as 'online' | 'instore']; c.sales++; c.salesInc += P(o.total); }
  for (const r of input.refunds) { const c = channels[channel(r.originSource) as 'online' | 'instore']; c.refunds += P(r.amount); }
  const channelOut = Object.fromEntries(Object.entries(channels).map(([k, c]) => [k, {
    orders: c.sales, sales: GBP(c.salesInc), refunds: GBP(c.refunds), net: GBP(c.salesInc - c.refunds),
  }]));

  // ---- payments: cash vs card ----
  const bucket = { till_cash: 0, till_card: 0, till_other: 0, cod: 0, online_card: 0, other: 0 } as Record<string, number>;
  const refundBucket = { till_cash: 0, till_card: 0, till_other: 0, cod: 0, online_card: 0, other: 0 } as Record<string, number>;
  for (const o of input.sales) {
    if (o.source === 'pos') {
      if (o.paymentBreakdown && o.paymentBreakdown.length) {
        for (const part of o.paymentBreakdown) {
          const k = part.method === 'cash' ? 'till_cash' : part.method === 'card' ? 'till_card' : 'till_other';
          bucket[k] += P(part.amount);
        }
      } else {
        const k = o.paymentMethod === 'cash' ? 'till_cash' : o.paymentMethod === 'card' ? 'till_card' : 'till_other';
        bucket[k] += P(o.total);
      }
    } else {
      bucket[o.paymentGateway === 'cod' ? 'cod' : 'online_card'] += P(o.total);
    }
  }
  for (const r of input.refunds) {
    const amt = P(r.amount);
    let k: string;
    if (r.originSource === 'pos') {
      k = r.method === 'cash' ? 'till_cash' : r.method === 'card' ? 'till_card'
        : r.method === 'original' ? (r.originPaymentMethod === 'cash' ? 'till_cash' : 'till_card') : 'till_other';
    } else if (r.method === 'original') {
      k = r.originGateway === 'cod' ? 'cod' : 'online_card';
    } else if (r.method === 'cash') k = 'cod';
    else if (r.method === 'card') k = 'online_card';
    else k = 'other';
    refundBucket[k] += amt;
  }
  const label: Record<string, string> = {
    till_cash: 'Cash (till)', till_card: 'Card (till, recorded)', till_other: 'Other (till)',
    cod: 'Cash on collection (online)', online_card: 'Card online', other: 'Other / manual',
  };
  const payments = Object.keys(label).map((k) => ({
    key: k, label: label[k], receipts: GBP(bucket[k] ?? 0), refunds: GBP(refundBucket[k] ?? 0),
    net: GBP((bucket[k] ?? 0) - (refundBucket[k] ?? 0)),
  })).filter((r) => r.receipts || r.refunds);
  const cashNetP = (bucket.till_cash - refundBucket.till_cash) + (bucket.cod - refundBucket.cod);
  const cardNetP = (bucket.till_card - refundBucket.till_card) + (bucket.online_card - refundBucket.online_card);

  // ---- discounts and returns ----
  const discountOrders = input.sales.filter((o) => P(o.discount) > 0);
  const reasons = new Map<string, { count: number; amountP: number }>();
  for (const r of input.refunds) {
    const cur = reasons.get(r.reasonCode) || { count: 0, amountP: 0 };
    cur.count++; cur.amountP += P(r.amount); reasons.set(r.reasonCode, cur);
  }

  // ---- staff ----
  const staffMap = new Map<string, { name: string; sales: number; salesInc: number; discount: number; overrides: number; returns: number; returnsInc: number }>();
  const st = (name: string | null) => {
    const k = name || 'Unknown';
    if (!staffMap.has(k)) staffMap.set(k, { name: k, sales: 0, salesInc: 0, discount: 0, overrides: 0, returns: 0, returnsInc: 0 });
    return staffMap.get(k)!;
  };
  for (const o of input.sales) if (o.source === 'pos') {
    const s = st(o.staffName); s.sales++; s.salesInc += P(o.total); s.discount += P(o.discount);
    if (o.approvedBy) s.overrides++;
  }
  for (const o of input.returnOrders) {
    const s = st(o.staffName); s.returns++; s.returnsInc += P(o.total);
  }
  const staff = [...staffMap.values()].map((s) => ({
    name: s.name, sales: s.sales, salesTotal: GBP(s.salesInc), discountsGiven: GBP(s.discount),
    managerApprovedDiscounts: s.overrides, returns: s.returns, returnsTotal: GBP(s.returnsInc),
    netTotal: GBP(s.salesInc + s.returnsInc),
  })).sort((a, b) => b.netTotal - a.netTotal);

  // ---- cash reconciliation ----
  const movementsByShift = new Map<number, { paidIn: number; paidOut: number }>();
  for (const m of input.movements) {
    const cur = movementsByShift.get(m.shiftId) || { paidIn: 0, paidOut: 0 };
    if (m.kind === 'paid_in') cur.paidIn += P(m.amount); else cur.paidOut += P(m.amount);
    movementsByShift.set(m.shiftId, cur);
  }
  const cashSalesByShift = new Map<number, number>();
  for (const o of input.sales) if (o.source === 'pos' && o.shiftId != null) {
    const parts = o.paymentBreakdown && o.paymentBreakdown.length ? o.paymentBreakdown.filter((p) => p.method === 'cash').map((p) => P(p.amount))
      : o.paymentMethod === 'cash' ? [P(o.total)] : [];
    cashSalesByShift.set(o.shiftId, (cashSalesByShift.get(o.shiftId) || 0) + parts.reduce((a, b) => a + b, 0));
  }
  const cashRefundsByShift = new Map<number, number>();
  for (const o of input.returnOrders) if (o.shiftId != null && o.paymentMethod === 'refund_cash') {
    cashRefundsByShift.set(o.shiftId, (cashRefundsByShift.get(o.shiftId) || 0) + P(o.total)); // negative
  }
  let varianceTotalP = 0, shiftsWithVariance = 0;
  const shiftRows = input.shifts.map((s) => {
    const mv = movementsByShift.get(s.id) || { paidIn: 0, paidOut: 0 };
    const cashSales = cashSalesByShift.get(s.id) || 0;
    const cashRefunds = cashRefundsByShift.get(s.id) || 0;
    const floatP = P(s.openingFloat);
    const calculatedP = floatP + cashSales + cashRefunds + mv.paidIn - mv.paidOut;
    const variance = s.variance != null ? P(s.variance) : null;
    if (variance) { varianceTotalP += variance; shiftsWithVariance++; }
    return {
      id: s.id, register: s.register, openedBy: s.openedByName, closedBy: s.closedByName,
      openedAt: s.openedAt, closedAt: s.closedAt,
      openingFloat: GBP(floatP), cashSales: GBP(cashSales), cashRefunds: GBP(-cashRefunds),
      paidIn: GBP(mv.paidIn), paidOut: GBP(mv.paidOut),
      expectedCash: s.expectedCash != null ? GBP(P(s.expectedCash)) : null,
      calculatedExpected: GBP(calculatedP),
      expectedMatchesRecord: s.expectedCash != null ? P(s.expectedCash) === calculatedP : null,
      countedCash: s.countedCash != null ? GBP(P(s.countedCash)) : null,
      variance: variance != null ? GBP(variance) : null,
      note: s.discrepancyNote,
    };
  });

  // ---- stock (as of now) ----
  const activeVariants = input.variants.filter((v) => v.isActive && v.productActive);
  let stockUnits = 0, retailValueP = 0, costValueP = 0, missingCostVariants = 0;
  for (const v of activeVariants) {
    stockUnits += v.stock;
    retailValueP += P(v.price) * v.stock;
    if (v.currentCost != null) costValueP += P(v.currentCost) * v.stock;
    else if (v.stock > 0) missingCostVariants++;
  }
  const lowStock = activeVariants.filter((v) => v.stock <= v.threshold)
    .sort((a, b) => a.stock - b.stock).slice(0, 50)
    .map((v) => ({ sku: v.sku, product: v.productName, flavour: v.flavor, strength: v.strength, stock: v.stock, threshold: v.threshold }));
  const slowCut = opts.now.getTime() - opts.slowDays * 86400000;
  const slowMoving = activeVariants
    .filter((v) => v.stock > 0 && (v.lastSoldAt == null || v.lastSoldAt.getTime() < slowCut))
    .map((v) => ({
      sku: v.sku, product: v.productName, flavour: v.flavor, strength: v.strength, stock: v.stock,
      lastSold: v.lastSoldAt ? v.lastSoldAt.toISOString().slice(0, 10) : null,
      daysSinceSale: v.lastSoldAt ? Math.floor((opts.now.getTime() - v.lastSoldAt.getTime()) / 86400000) : null,
      valueAtCost: v.currentCost != null && opts.isOwner ? GBP(P(v.currentCost) * v.stock) : null,
    }))
    .sort((a, b) => (b.daysSinceSale ?? 99999) - (a.daysSinceSale ?? 99999)).slice(0, 50);

  // ---- tax breakdown ----
  const taxRows = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, t]) => ({
    rate, netSales: GBP(t.netP), vat: GBP(t.vatP), grossSales: GBP(t.incP),
  }));

  const summary = {
    orders: input.sales.length,
    grossSales: GBP(grossSalesP),
    discounts: GBP(discountP),
    salesIncVat: GBP(salesIncP),
    refunds: GBP(refundsIncP),
    netSalesIncVat: GBP(netSalesIncP),
    vatOnNetSales: GBP(vatNetP),
    netSalesExVat: GBP(revenueExVatP),
    tillReturns: input.returnOrders.length,
  };

  return {
    period: { from: opts.from, to: opts.to },
    summary,
    channels: channelOut,
    payments,
    cash: { cashNet: GBP(cashNetP), cardNet: GBP(cardNetP) },
    bestSellers: {
      product: toSellers(aggs.product), brand: toSellers(aggs.brand),
      flavour: toSellers(aggs.flavour), strength: toSellers(aggs.strength),
    },
    discounts: {
      orders: discountOrders.length, total: GBP(discountP),
      managerApproved: input.sales.filter((o) => o.approvedBy).length,
    },
    returns: {
      count: input.refunds.length, total: GBP(refundsIncP),
      byReason: [...reasons.entries()].map(([code, v]) => ({ reason: code, count: v.count, total: GBP(v.amountP) })),
    },
    tax: {
      standardRate: std, rows: taxRows,
      shipping: GBP(shippingSoldP), shippingRefunded: GBP(shippingRefundedP),
      vatOnNetSales: GBP(vatNetP),
    },
    staff,
    cashShifts: {
      rows: shiftRows, count: shiftRows.length, openNow: input.openShiftCount,
      totalVariance: GBP(varianceTotalP), shiftsWithVariance,
    },
    stock: {
      units: stockUnits,
      retailValue: GBP(retailValueP),
      lowStock, slowMoving, slowDays: opts.slowDays,
      ...(opts.isOwner ? { costValue: GBP(costValueP), variantsWithoutCost: missingCostVariants } : {}),
    },
    profit: opts.isOwner ? {
      costOfGoodsSold: GBP(cogsP),
      grossProfit: GBP(grossProfitP),
      grossMarginPct: pct(grossProfitP, revenueExVatP),
      complete: profitComplete,
      unitsSold: soldUnits,
      unitsWithCost: costedUnits,
      costCoveragePct: pct(costedUnits, soldUnits),
      estimatedCostLines: estimatedLines,
      missingCostLines,
      missingCostUnits,
      definition: 'Gross profit = net sales ex VAT − cost of goods sold (cost snapshot at sale; returned units restocked are credited back).',
    } : null,
  };
}

export type Report = ReturnType<typeof computeReport>;
