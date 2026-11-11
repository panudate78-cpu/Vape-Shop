// Loads the rows the owner reports need for one London date range, then hands them to computeReport.
import { db } from '@/db';
import {
  orders, orderItems, orderRefunds, orderRefundLines, cashShifts, cashMovements,
  productVariants, products, categories, stockMovements, stockBatches,
} from '@/db/schema';
import { and, eq, gte, lt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { londonMidnight, addDays } from './london';
import { computeReport, type ReportInput, type SaleOrder, type Item, type Refund, type RefundLine, type VariantInfo, type Shift, type CashMovement } from './model';

export const STANDARD_RATE_KEY = 'standard_vat_rate';
const PAID_STATUSES = ['paid', 'partially_refunded', 'refunded'];

const num = (v: unknown) => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown) => (v == null ? null : Number(v));

export async function standardVatRate(): Promise<number> {
  const rows = await db.execute(sql`SELECT value FROM app_settings WHERE key = ${STANDARD_RATE_KEY} LIMIT 1`);
  const v = (rows as any[])[0]?.value;
  const n = v == null ? 20 : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 20;
}

function toSale(o: any): SaleOrder {
  return {
    id: o.id, createdAt: new Date(o.createdAt), source: o.source || 'online', paymentStatus: o.paymentStatus,
    paymentGateway: o.paymentGateway ?? null, paymentMethod: o.paymentMethod ?? null,
    paymentBreakdown: Array.isArray(o.paymentBreakdown) ? o.paymentBreakdown.map((p: any) => ({ method: String(p.method), amount: num(p.amount) })) : null,
    subtotal: num(o.subtotal), discount: num(o.discount), shippingCost: num(o.shippingCost), total: num(o.totalAmount),
    parentOrderId: o.parentOrderId ?? null, staffName: o.staffName ?? null, approvedBy: o.approvedBy ?? null,
    shiftId: o.shiftId ?? null, registerId: o.registerId ?? null,
  };
}


// Weighted batch cost per unit for each (order, variant) sold. Missing if any consumed unit has no batch cost.
export async function batchCostsForSales(orderIds: number[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!orderIds.length) return out;
  const rows = await db.select({
    orderId: stockMovements.orderId, variantId: stockMovements.variantId, delta: stockMovements.delta,
    batchId: stockMovements.batchId, batchCost: stockBatches.unitCost,
  }).from(stockMovements)
    .leftJoin(stockBatches, eq(stockBatches.id, stockMovements.batchId))
    .where(and(inArray(stockMovements.orderId, orderIds), inArray(stockMovements.reason, ['sale_online', 'sale_till']), lt(stockMovements.delta, 0)));
  const acc = new Map<string, { units: number; cost: number; unknown: boolean }>();
  for (const r of rows) {
    const key = `${r.orderId}:${r.variantId}`;
    const a = acc.get(key) ?? { units: 0, cost: 0, unknown: false };
    const units = -r.delta;
    a.units += units;
    if (r.batchId == null || r.batchCost == null) a.unknown = true;
    else a.cost += units * Number(r.batchCost);
    acc.set(key, a);
  }
  for (const [key, a] of acc) {
    if (!a.unknown && a.units > 0) out.set(key, Math.round((a.cost / a.units) * 100) / 100);
  }
  return out;
}

export async function loadReport(from: string, to: string, opts: { isOwner: boolean; slowDays: number; now?: Date }) {
  const start = londonMidnight(from);
  const end = londonMidnight(addDays(to, 1));
  const now = opts.now ?? new Date();
  const standardRate = await standardVatRate();

  // Sales: paid orders that are not till returns. Refunded or partly refunded sales are still sales.
  const saleRows = await db.select().from(orders).where(and(
    inArray(orders.paymentStatus, PAID_STATUSES), isNull(orders.parentOrderId),
    gte(orders.createdAt, start), lt(orders.createdAt, end),
  ));
  const sales = saleRows.map(toSale);
  const saleIds = sales.map((s) => s.id);

  const itemRows = saleIds.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, saleIds)) : [];
  // Cost at sale time = the batch cost of the stock the sale actually consumed (weighted by units per batch).
  // A sale whose stock came from untracked history, or from a batch with no cost, falls back to the cost snapshot on the line.
  const batchCostByOrderVariant = await batchCostsForSales(saleIds);
  const items: Item[] = itemRows.map((i) => {
    const batchCost = i.variantId != null ? batchCostByOrderVariant.get(`${i.orderId}:${i.variantId}`) : undefined;
    return {
      id: i.id, orderId: i.orderId, variantId: i.variantId ?? null, productName: i.productName, sku: i.sku,
      quantity: Number(i.quantity), unitPrice: num(i.unitPrice), unitCost: batchCost ?? numOrNull(i.unitCost),
    };
  });

  // Refunds created in the period, with the order each one belongs to.
  const refundRows = await db.select().from(orderRefunds).where(and(gte(orderRefunds.createdAt, start), lt(orderRefunds.createdAt, end)));
  const originIds = [...new Set(refundRows.map((r) => r.orderId))];
  const originRows = originIds.length ? await db.select().from(orders).where(inArray(orders.id, originIds)) : [];
  const originById = new Map(originRows.map((o) => [o.id, o]));
  const refunds: Refund[] = refundRows.map((r) => {
    const o = originById.get(r.orderId);
    return {
      id: r.id, orderId: r.orderId, createdAt: new Date(r.createdAt), amount: num(r.amount), method: r.method, reasonCode: r.reasonCode,
      originSource: o?.source || 'online', originGateway: o?.paymentGateway ?? null, originPaymentMethod: o?.paymentMethod ?? null,
      originShiftId: o?.shiftId ?? null,
    };
  });
  const refundIds = refundRows.map((r) => r.id);
  const refundLineRows = refundIds.length ? await db.select().from(orderRefundLines).where(inArray(orderRefundLines.refundId, refundIds)) : [];
  const refundLines: RefundLine[] = refundLineRows.map((l) => ({
    refundId: l.refundId, orderItemId: l.orderItemId, quantity: Number(l.quantity), amount: num(l.amount), restock: !!l.restock,
  }));

  // Till return orders in the period (negative totals). Used for staff and cash only.
  const returnRows = await db.select().from(orders).where(and(
    isNotNull(orders.parentOrderId), gte(orders.createdAt, start), lt(orders.createdAt, end),
  ));
  const returnOrders = returnRows.map(toSale);

  // Cash shifts closed in the period, and their paid in / out.
  const shiftRows = await db.select().from(cashShifts).where(and(
    eq(cashShifts.status, 'closed'), isNotNull(cashShifts.closedAt), gte(cashShifts.closedAt, start), lt(cashShifts.closedAt, end),
  ));
  const shifts: Shift[] = shiftRows.map((s) => ({
    id: s.id, register: s.register, status: s.status, openedByName: s.openedByName ?? null, closedByName: s.closedByName ?? null,
    openedAt: new Date(s.openedAt), closedAt: s.closedAt ? new Date(s.closedAt) : null, openingFloat: num(s.openingFloat),
    expectedCash: numOrNull(s.expectedCash), countedCash: numOrNull(s.countedCash), variance: numOrNull(s.variance),
    discrepancyNote: s.discrepancyNote ?? null,
  }));
  const shiftIds = shifts.map((s) => s.id);
  const moveRows = shiftIds.length ? await db.select().from(cashMovements).where(inArray(cashMovements.shiftId, shiftIds)) : [];
  const movements: CashMovement[] = moveRows.map((m) => ({ shiftId: m.shiftId, kind: m.kind, amount: num(m.amount) }));
  const [openRow] = await db.select({ n: sql<number>`count(*)::int` }).from(cashShifts).where(eq(cashShifts.status, 'open'));

  // Variants for stock, names and the VAT rate of each category. Last sale is across all time.
  const variantRows = await db
    .select({
      variantId: productVariants.id, sku: productVariants.sku, flavor: productVariants.flavor,
      strength: productVariants.nicotineStrength, stock: productVariants.stockQuantity,
      threshold: productVariants.lowStockThreshold, isActive: productVariants.isActive,
      unitCost: productVariants.unitCost, priceOverride: productVariants.priceOverride,
      productName: products.name, brand: products.brand, basePrice: products.basePrice,
      productCost: products.costPrice, productActive: products.isActive, categoryRate: categories.taxRate,
      lastSoldAt: sql<Date | null>`(
        select max(o.created_at) from order_items oi join orders o on o.id = oi.order_id
        where oi.variant_id = ${productVariants.id} and oi.quantity > 0
          and o.parent_order_id is null and o.payment_status in ('paid','partially_refunded','refunded'))`,
    })
    .from(productVariants)
    .leftJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId));
  const variants: VariantInfo[] = variantRows.map((v) => {
    const cost = v.unitCost != null ? Number(v.unitCost) : v.productCost != null ? Number(v.productCost) : null;
    return {
      variantId: v.variantId, productName: v.productName || 'Unknown product', brand: v.brand || '', flavor: v.flavor || '',
      strength: v.strength || '', categoryRate: v.categoryRate != null ? Number(v.categoryRate) : standardRate,
      currentCost: cost, price: v.priceOverride != null && Number(v.priceOverride) > 0 ? Number(v.priceOverride) : num(v.basePrice),
      stock: Number(v.stock), threshold: Number(v.threshold), isActive: !!v.isActive, sku: v.sku,
      lastSoldAt: v.lastSoldAt ? new Date(v.lastSoldAt as any) : null, productActive: v.productActive !== false,
    };
  });

  const input: ReportInput = {
    sales, items, refunds, refundLines, returnOrders, shifts, movements,
    openShiftCount: openRow?.n ?? 0, variants,
  };
  return computeReport(input, { from, to, standardRate, slowDays: opts.slowDays, now, isOwner: opts.isOwner });
}
