/**
 * Shared helpers for accounting CSV exports (QuickBooks, Xero, Sage).
 *
 * Each platform gets its own formatter that turns a list of NormalisedOrder
 * rows into a CSV string. We load all paid orders + line items once and
 * hand them to whatever formatter the endpoint requests.
 */
import { db } from '@/db';
import { orders, orderItems, users } from '@/db/schema';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';

export type LineItem = {
  orderId: number; name: string; label: string; sku: string;
  qty: number; unitPrice: number;
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
  const conds: any[] = [eq(orders.paymentStatus, 'paid')];
  if (params.from) conds.push(sql`${orders.createdAt} >= ${new Date(params.from + 'T00:00:00')}`);
  if (params.to) conds.push(sql`${orders.createdAt} < ${new Date(params.to + 'T00:00:00')}`);
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
      }).from(orderItems).where(inArray(orderItems.orderId, rows.map((r) => r.order.id)))
    : [];
  const itemsByOrder = new Map<number, LineItem[]>();
  for (const it of items) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    itemsByOrder.get(it.orderId)!.push({ ...it, qty: Number(it.qty), unitPrice: Number(it.unitPrice) });
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

// ---------- QuickBooks Online (Sales Receipts CSV) ----------
export function toQuickBooks(orders: OrderRow[], opts: { depositTo?: string; defaultItem?: string; shippingItem?: string; discountItem?: string }) {
  const depositTo = opts.depositTo || 'Sales';
  const defaultItem = opts.defaultItem || 'Sales';
  const shippingItem = opts.shippingItem || 'Postage';
  const discountItem = opts.discountItem || 'Discounts';
  const header = ['Date','Customer','Email','Payment Method','Reference No.','Deposit To','Memo','Product/Service','Description','Qty','Rate','Amount','Tax','Class'];
  const out: string[] = [];
  for (const o of orders) {
    const cls = o.isPos ? 'In-store' : 'Online';
    for (const li of o.items) {
      const amount = +(li.qty * li.unitPrice).toFixed(2);
      out.push([fmtDateUk(o.createdAt), o.customerName, o.customerEmail, o.payMethod, o.number, depositTo, o.memo, defaultItem,
        `${li.name}${li.label ? ' — ' + li.label : ''}`, li.qty, li.unitPrice.toFixed(2), amount.toFixed(2), '', cls].map(csv).join(','));
    }
    if (o.shipping > 0) {
      out.push([fmtDateUk(o.createdAt), o.customerName, o.customerEmail, o.payMethod, o.number, depositTo, o.memo, shippingItem,
        'Delivery / postage', 1, o.shipping.toFixed(2), o.shipping.toFixed(2), '', cls].map(csv).join(','));
    }
    if (o.discount > 0) {
      out.push([fmtDateUk(o.createdAt), o.customerName, o.customerEmail, o.payMethod, o.number, depositTo, o.memo, discountItem,
        'Discount applied', 1, (-o.discount).toFixed(2), (-o.discount).toFixed(2), '', cls].map(csv).join(','));
    }
    if (o.items.length === 0 && o.shipping === 0 && o.discount === 0) {
      out.push([fmtDateUk(o.createdAt), o.customerName, o.customerEmail, o.payMethod, o.number, depositTo, o.memo, defaultItem,
        'Order total', 1, o.total.toFixed(2), o.total.toFixed(2), '', cls].map(csv).join(','));
    }
  }
  return { header, rows: out };
}

// ---------- Xero (Sales Invoices, ACC-REC sales) ----------
// Minimal Xero CSV invoice format: one header row per invoice (ContactName,
// InvoiceNumber, InvoiceDate, DueDate, Description, Quantity, UnitAmount,
// AccountCode, TaxType, Reference) followed by repeating line rows.
// For our purposes we send one invoice per order, one row per line, with an
// auto-generated header per order by repeating the shared fields in every row
// (Xero handles duplicate *InvoiceNumber rows as additional lines).
export function toXero(orders: OrderRow[], opts: { salesAccount?: string; shippingAccount?: string; discountAccount?: string; taxRate?: string }) {
  const salesAccount = opts.salesAccount || process.env.XERO_SALES_ACCOUNT || '200';
  const shippingAccount = opts.shippingAccount || process.env.XERO_SHIPPING_ACCOUNT || salesAccount;
  const discountAccount = opts.discountAccount || process.env.XERO_DISCOUNT_ACCOUNT || salesAccount;
  // Tax rates: UK vape retail is standard 20% VAT inclusive.
  const tax = opts.taxRate || process.env.XERO_TAX_RATE || '20% (VAT on Income)';

  const header = ['*ContactName','*InvoiceNumber','*InvoiceDate','*DueDate','Description','*Quantity','*UnitAmount','*AccountCode','*TaxType','Reference','Status','Currency','BrandingTheme'];
  const out: string[] = [];
  for (const o of orders) {
    const date = fmtDateUk(o.createdAt);
    const status = 'AUTHORISED'; // paid sales receipt: create as authorised (Xero marks it unpaid if status AUTHORISED; for fully paid we'd need a payment row too, which is easier to reconcile in-bank)
    for (const li of o.items) {
      out.push([
        o.customerName, o.number, date, date,
        `${li.name}${li.label ? ' — ' + li.label : ''}`,
        li.qty, li.unitPrice.toFixed(2), salesAccount, tax, o.memo, status, 'GBP', '',
      ].map(csv).join(','));
    }
    if (o.shipping > 0) {
      out.push([o.customerName, o.number, date, date, 'Delivery / postage', 1, o.shipping.toFixed(2), shippingAccount, tax, o.memo, status, 'GBP', ''].map(csv).join(','));
    }
    if (o.discount > 0) {
      out.push([o.customerName, o.number, date, date, 'Discount applied', 1, (-o.discount).toFixed(2), discountAccount, tax, o.memo, status, 'GBP', ''].map(csv).join(','));
    }
    if (o.items.length === 0 && o.shipping === 0 && o.discount === 0) {
      out.push([o.customerName, o.number, date, date, 'Order total', 1, o.total.toFixed(2), salesAccount, tax, o.memo, status, 'GBP', ''].map(csv).join(','));
    }
  }
  return { header, rows: out };
}

// ---------- Sage Business Cloud (Sales invoices CSV, UK) ----------
// Sage's UK CSV uses Type, Account Reference, Date, Reference, Details, Net,
// Tax Code, Tax, Total per line (audit-style). We also output Sage 50
// friendly variant. Since prices are VAT-INCLUSIVE at UK retail, we split
// gross into Net + VAT at 20% for T1 (standard rate).
export function toSage(orders: OrderRow[], opts: { nominalCode?: string; shippingNominal?: string; discountNominal?: string; taxCode?: string; customerRef?: string }) {
  const nominal = opts.nominalCode || process.env.SAGE_SALES_NOMINAL || '4000';
  const shipNominal = opts.shippingNominal || process.env.SAGE_SHIPPING_NOMINAL || nominal;
  const discNominal = opts.discountNominal || process.env.SAGE_DISCOUNT_NOMINAL || nominal;
  const taxCode = opts.taxCode || process.env.SAGE_TAX_CODE || '1'; // 1 = T1 standard 20% VAT
  const VAT_RATE = 0.2; // TODO: pull from a future tax-rate setting
  const split = (gross: number) => {
    const net = +(gross / (1 + VAT_RATE)).toFixed(2);
    const v = +(gross - net).toFixed(2);
    return { net, v };
  };
  const header = ['Type','Account Reference','Date','Reference','Details','Net','Tax Code','Tax','Total'];
  const out: string[] = [];
  for (const o of orders) {
    const ac = o.customerName.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, ''); // Sage account refs ≤ 8 chars
    const date = fmtDateUk(o.createdAt);
    const addLine = (details: string, gross: number, nom: string, negative = false) => {
      const g = negative ? -Math.abs(gross) : Math.abs(gross);
      const { net, v } = split(g);
      out.push(['SI', ac, date, o.number, details, net.toFixed(2), taxCode, v.toFixed(2), g.toFixed(2)].map(csv).join(','));
    };
    for (const li of o.items) {
      addLine(`${li.name}${li.label ? ' — ' + li.label : ''}`, li.qty * li.unitPrice, nominal);
    }
    if (o.shipping > 0) addLine('Delivery / postage', o.shipping, shipNominal);
    if (o.discount > 0) addLine('Discount applied', o.discount, discNominal, true);
    if (o.items.length === 0 && o.shipping === 0 && o.discount === 0) addLine('Order total', o.total, nominal);
  }
  return { header, rows: out };
}
