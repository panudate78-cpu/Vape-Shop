/**
 * Shared helpers for accounting CSV exports (QuickBooks, Xero, Sage).
 *
 * Each platform gets its own formatter that turns a list of NormalisedOrder
 * rows into a CSV string. We load all paid orders + line items once and
 * hand them to whatever formatter the endpoint requests.
 */
import { db } from '@/db';
import { orders, orderItems, users } from '@/db/schema';
import { eq, desc, sql, and, inArray, isNull } from 'drizzle-orm';
import { productVariants, products, categories } from '@/db/schema';
import { standardVatRate } from '@/lib/reports/load';
import { londonMidnight, addDays } from '@/lib/reports/london';

export type LineItem = {
  orderId: number; name: string; label: string; sku: string;
  qty: number; unitPrice: number; // unitPrice is VAT-inclusive (what the customer paid)
  taxRate: number; // VAT % of the product's category, e.g. 20
};
export type OrderRow = {
  id: number; number: string; createdAt: Date;
  customerName: string; customerEmail: string;
  isPos: boolean; collectionMode: string; payMethod: string;
  memo: string; staffNote: string | null;
  shipping: number; discount: number; total: number;
  items: LineItem[];
};

// Lazy-add columns if missing (same safe pattern as stats/pos)
let ensured = false;
export async function ensureCols() {
  if (ensured) return;
  const tryAdd = async (stmt: ReturnType<typeof sql>) => {
    try { await db.execute(stmt); } catch (e) {
      const msg = (e as Error)?.message || '';
      if (!/already exists|duplicate column/i.test(msg)) console.warn('[acct-export] column add warning:', msg);
    }
  };
  await tryAdd(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT`);
  await tryAdd(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT`);
  await tryAdd(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_note TEXT`);
  try { await db.execute(sql`UPDATE orders SET source='online' WHERE source IS NULL OR source=''`); } catch {}
  ensured = true;
}

export function csv(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function fmtDateUk(iso: Date): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
export function fmtDateIso(iso: Date): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export async function loadPaidOrders(params: { from?: string | null; to?: string | null; source?: string | null }): Promise<OrderRow[]> {
  await ensureCols();
  // Same sale definition as the owner reports: refunded or partly refunded sales are still sales.
  // Refunds themselves are NOT exported as credit lines yet (see notes).
  const conds: any[] = [inArray(orders.paymentStatus, ['paid', 'partially_refunded', 'refunded'])];
  // Till returns are separate negative rows linked by parentOrderId; they are refunds, not sales (same as the reports).
  conds.push(isNull(orders.parentOrderId));
  // London-midnight bounds as ISO strings (raw Date objects are not accepted by the driver in sql templates).
  if (params.from) conds.push(sql`${orders.createdAt} >= ${londonMidnight(params.from).toISOString()}::timestamptz`);
  if (params.to) conds.push(sql`${orders.createdAt} < ${londonMidnight(addDays(params.to, 1)).toISOString()}::timestamptz`);
  if (params.source === 'online') conds.push(sql`coalesce(${orders.source},'online') = 'online'`);
  if (params.source === 'pos') conds.push(sql`${orders.source} = 'pos'`);
  const where = conds.length === 1 ? conds[0] : and(...conds);

  const qb = db
    .select({ order: orders, email: users.email, fullName: users.fullName })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .orderBy(desc(orders.createdAt));
  const rows = await (where ? qb.where(where) : qb);

  const items = rows.length
    ? await db.select({
        orderId: orderItems.orderId, name: orderItems.productName, label: orderItems.variantLabel,
        sku: orderItems.sku, qty: orderItems.quantity, unitPrice: orderItems.unitPrice,
        variantId: orderItems.variantId,
      }).from(orderItems).where(inArray(orderItems.orderId, rows.map((r) => r.order.id)))
    : [];
  // VAT rate per variant, from its category (set in the VAT rates section of the reports page).
  const variantIds = [...new Set(items.map((i) => i.variantId).filter((x): x is number => x != null))];
  const rateByVariant = new Map<number, number>();
  if (variantIds.length) {
    const rateRows = await db.select({ id: productVariants.id, taxRate: categories.taxRate })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(inArray(productVariants.id, variantIds));
    for (const r of rateRows) rateByVariant.set(r.id, Number(r.taxRate));
  }
  const std = await standardVatRate();
  const itemsByOrder = new Map<number, LineItem[]>();
  for (const it of items) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    const taxRate = it.variantId != null && rateByVariant.has(it.variantId) ? rateByVariant.get(it.variantId)! : std;
    itemsByOrder.get(it.orderId)!.push({
      orderId: it.orderId, name: it.name, label: it.label, sku: it.sku,
      qty: Number(it.qty), unitPrice: Number(it.unitPrice), taxRate,
    });
  }

  return rows.map(({ order, email, fullName }) => {
    const shipName = (order.shippingAddress as any)?.fullName || (order.shippingAddress as any)?.name || '';
    const isPos = order.source === 'pos';
    return {
      id: order.id,
      number: `${isPos ? 'POS' : 'ORD'}-${order.id}`,
      createdAt: new Date(order.createdAt),
      customerName: fullName || shipName || order.guestEmail || email || 'Guest customer',
      customerEmail: order.guestEmail || email || '',
      isPos,
      collectionMode: order.collectionMode,
      payMethod: isPos
        ? (order.paymentMethod === 'card' ? 'Card' : 'Cash')
        : (order.paymentGateway === 'stripe' ? 'Stripe' : order.paymentGateway === 'cod' ? 'Cash on collection' : 'Online'),
      memo: isPos
        ? `In-store sale (POS)${order.staffNote ? ' — ' + order.staffNote : ''}`
        : `Online order #${order.id} — ${order.collectionMode === 'collect' ? 'Click & Collect' : 'Delivery'}`,
      staffNote: order.staffNote,
      shipping: Number((order as any).shippingCost || 0),
      discount: Number((order as any).discount || 0),
      total: Number(order.totalAmount),
      items: itemsByOrder.get(order.id) || [],
    };
  });
}

// ---------- Shared VAT maths for the exporters ----------
// Prices are VAT-inclusive. Each line is split into ex-VAT net and VAT at its own category rate.
// All three exports send ex-VAT amounts and let the accounting package apply the tax code, so the
// VAT total in the file matches the VAT figure in the owner reports.
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function splitGross(gross: number, ratePct: number) {
  const net = r2(gross / (1 + ratePct / 100));
  return { net, vat: r2(gross - net) };
}
export type ExportLine = { description: string; qty: number; gross: number; rate: number; account: string };

// Lines the exporters write: one per product line, plus postage, plus a discount (negative) at the standard rate.
export function invoiceLines(o: OrderRow, std: number, shippingAccount: string, discountAccount: string): ExportLine[] {
  const out: ExportLine[] = [];
  for (const li of o.items) {
    out.push({ description: `${li.name}${li.label ? ' — ' + li.label : ''}`, qty: li.qty, gross: r2(li.qty * li.unitPrice), rate: li.taxRate, account: '' });
  }
  if (o.shipping > 0) out.push({ description: 'Delivery / postage', qty: 1, gross: r2(o.shipping), rate: std, account: shippingAccount });
  if (o.discount > 0) out.push({ description: 'Discount applied', qty: 1, gross: -r2(o.discount), rate: std, account: discountAccount });
  if (out.length === 0) out.push({ description: 'Order total', qty: 1, gross: r2(o.total), rate: std, account: '' });
  return out;
}

// UK dates as DD/MM/YYYY (day first).
export const ukDate = (d: Date) => fmtDateUk(d);

// ---------- Xero: sales invoice import (27 fixed columns, in Xero's order) ----------
export const XERO_HEADER = [
  '*ContactName', 'EmailAddress', 'POAddressLine1', 'POAddressLine2', 'POAddressLine3', 'POAddressLine4',
  'POCity', 'PORegion', 'POPostalCode', 'POCountry', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate',
  'InventoryItemCode', '*Description', '*Quantity', '*UnitAmount', 'Discount', '*AccountCode', '*TaxType',
  'TrackingName1', 'TrackingOption1', 'TrackingName2', 'TrackingOption2', 'Currency', 'BrandingTheme',
] as const;
// Xero tax rate names (Settings > Tax rates). A rate with no name here is an export error, not a silent zero.
export const XERO_TAX_NAMES: Record<number, string> = { 20: '20% (VAT on Income)', 5: '5% (VAT on Income)', 0: 'Zero Rated Income' };

export function toXero(orders: OrderRow[], opts: { salesAccount?: string; shippingAccount?: string; discountAccount?: string; taxNames?: Record<number, string>; std: number }) {
  const sales = opts.salesAccount || process.env.XERO_SALES_ACCOUNT || '200';
  const names = opts.taxNames || XERO_TAX_NAMES;
  const out: string[] = [];
  for (const o of orders) {
    const date = ukDate(o.createdAt);
    for (const l of invoiceLines(o, opts.std, opts.shippingAccount || sales, opts.discountAccount || sales)) {
      const tax = names[l.rate];
      if (!tax) throw new Error(`No Xero tax rate name configured for ${l.rate}% (order ${o.number}). Add it before exporting.`);
      const { net } = splitGross(l.gross, l.rate);
      const unit = +(net / l.qty).toFixed(4);
      const row: Record<string, string | number> = {
        '*ContactName': o.customerName, EmailAddress: o.customerEmail, '*InvoiceNumber': o.number,
        Reference: o.memo, '*InvoiceDate': date, '*DueDate': date, '*Description': l.description,
        '*Quantity': l.qty, '*UnitAmount': unit.toFixed(4), '*AccountCode': l.account || sales, '*TaxType': tax, Currency: 'GBP',
      };
      out.push(XERO_HEADER.map((h) => csv(row[h] ?? '')).join(','));
    }
  }
  return { header: [...XERO_HEADER], rows: out };
}

// ---------- QuickBooks Online: Sales Receipts (column order as QBO's sales receipt import expects) ----------
export const QBO_HEADER = [
  '*Sales Receipt No', 'Customer', '*Sales Receipt Date', '*Deposit Account', 'Location', 'Memo',
  'Item (Product/Service)', 'Item Description', 'Item Quantity', 'Item Rate', '*Item Amount', '*Item Tax Code',
  'Item Tax Amount', 'Currency', 'Service Date',
] as const;
// QBO tax code names for UK VAT. Confirm these match the tax codes in the company file.
export const QBO_TAX_CODES: Record<number, string> = { 20: '20.0% S', 5: '5.0% RR', 0: 'Zero rated' };

export function toQuickBooks(orders: OrderRow[], opts: { depositTo?: string; defaultItem?: string; shippingItem?: string; discountItem?: string; taxCodes?: Record<number, string>; std: number }) {
  const deposit = opts.depositTo || process.env.QBO_DEPOSIT_ACCOUNT || 'Undeposited Funds';
  const item = opts.defaultItem || 'Sales';
  const codes = opts.taxCodes || QBO_TAX_CODES;
  const out: string[] = [];
  for (const o of orders) {
    const date = ukDate(o.createdAt);
    for (const l of invoiceLines(o, opts.std, opts.shippingItem || 'Postage', opts.discountItem || 'Discounts')) {
      const code = codes[l.rate];
      if (!code) throw new Error(`No QuickBooks tax code configured for ${l.rate}% (order ${o.number}).`);
      const { net, vat } = splitGross(l.gross, l.rate);
      const row: Record<string, string | number> = {
        '*Sales Receipt No': o.number, Customer: o.customerName, '*Sales Receipt Date': date, '*Deposit Account': deposit,
        Memo: o.memo, 'Item (Product/Service)': l.account || item, 'Item Description': l.description,
        'Item Quantity': l.qty, 'Item Rate': +(net / l.qty).toFixed(4), '*Item Amount': net.toFixed(2), '*Item Tax Code': code,
        'Item Tax Amount': vat.toFixed(2), Currency: 'GBP',
      };
      out.push(QBO_HEADER.map((h) => csv(row[h] ?? '')).join(','));
    }
  }
  return { header: [...QBO_HEADER], rows: out };
}

// ---------- Sage: sales quick entries (Sage Accounting columns) ----------
// Date format and the Sage quick-entry type code are NOT yet confirmed against a real Sage Accounting import.
export const SAGE_HEADER = ['Type', 'Customer/Vendor Reference', 'Date', 'Name', 'Reference', 'Ledger Account', 'Details', 'Net', 'Tax Rate', 'Tax', 'Total'] as const;

export function toSage(orders: OrderRow[], opts: { nominalCode?: string; shippingNominal?: string; discountNominal?: string; std: number }) {
  const nominal = opts.nominalCode || process.env.SAGE_SALES_NOMINAL || '4000';
  const out: string[] = [];
  for (const o of orders) {
    const ref = o.customerName.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'GUEST';
    const date = ukDate(o.createdAt);
    for (const l of invoiceLines(o, opts.std, opts.shippingNominal || nominal, opts.discountNominal || nominal)) {
      const { net, vat } = splitGross(l.gross, l.rate);
      const row: Record<string, string | number> = {
        Type: 'SI', 'Customer/Vendor Reference': ref, Date: date, Name: o.customerName, Reference: o.number,
        'Ledger Account': l.account || nominal, Details: l.description.slice(0, 25), Net: net.toFixed(2),
        'Tax Rate': l.rate, Tax: vat.toFixed(2), Total: (net + vat).toFixed(2),
      };
      out.push(SAGE_HEADER.map((h) => csv(row[h] ?? '')).join(','));
    }
  }
  return { header: [...SAGE_HEADER], rows: out };
}
