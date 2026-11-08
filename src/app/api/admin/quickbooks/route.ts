import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, users } from '@/db/schema';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Lazy-add the POS columns if they don't exist yet (same safe pattern as stats/pos).
let ensured = false;
async function ensureCols() {
  if (ensured) return;
  const tryAdd = async (stmt: ReturnType<typeof sql>) => {
    try { await db.execute(stmt); } catch (e) {
      const msg = (e as Error)?.message || '';
      if (!/already exists|duplicate column/i.test(msg)) console.warn('[qb] column add warning:', msg);
    }
  };
  await tryAdd(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT`);
  await tryAdd(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT`);
  await tryAdd(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_note TEXT`);
  try { await db.execute(sql`UPDATE orders SET source='online' WHERE source IS NULL OR source=''`); } catch {}
  ensured = true;
}

function csv(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(iso: string | Date): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getDate()}/${d.getMonth() + 1}/${y}`; // DD/MM/YYYY (UK format — QBO picks it up from your locale)
}

/**
 * GET /api/admin/quickbooks?from=YYYY-MM-DD&to=YYYY-MM-DD&source=online|pos|all
 *
 * Exports PAID orders in a format importable directly into QuickBooks Online
 * as Sales Receipts (Banking → Receipts / Import invoices/sales receipts → CSV).
 *
 * Each order line becomes a row in the CSV, plus a row for shipping/discount
 * where applicable. Header matches QBO's expected UK column set.
 *
 * NOTE: This is a one-way CSV sync. Set the QuickBooks product/service names
 * in QBO_IMAP env var (or edit the CSV before import) if your QBO item names
 * differ from the shop's product names. For real-time two-way sync (automatic
 * sales receipt creation when an order is placed), a Zapier webhook or native
 * QBO OAuth integration is the next step (see SETUP.md).
 */
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await ensureCols();

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const source = url.searchParams.get('source') || 'all';
  const depositTo = url.searchParams.get('depositTo') || process.env.QB_DEPOSIT_TO || 'Sales';
  const defaultItem = url.searchParams.get('defaultItem') || process.env.QB_DEFAULT_ITEM || 'Sales';
  const shippingItem = url.searchParams.get('shippingItem') || process.env.QB_SHIPPING_ITEM || 'Postage';
  const discountItem = url.searchParams.get('discountItem') || process.env.QB_DISCOUNT_ITEM || 'Discounts';

  const conds: any[] = [eq(orders.paymentStatus, 'paid')];
  if (from) conds.push(sql`${orders.createdAt} >= ${new Date(from + 'T00:00:00')}`);
  if (to) conds.push(sql`${orders.createdAt} < ${new Date(to + 'T00:00:00')}`);
  if (source === 'online') conds.push(sql`coalesce(${orders.source},'online') = 'online'`);
  if (source === 'pos') conds.push(sql`${orders.source} = 'pos'`);

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
  const itemsByOrder = new Map<number, typeof items>();
  for (const it of items) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    itemsByOrder.get(it.orderId)!.push(it);
  }

  const header = [
    'Date','Customer','Email','Payment Method','Reference No.','Deposit To',
    'Memo','Product/Service','Description','Qty','Rate','Amount','Tax','Class',
  ];

  const out: string[] = [];
  for (const { order, email, fullName } of rows) {
    const shipName = (order.shippingAddress as any)?.fullName || (order.shippingAddress as any)?.name || '';
    const customer = fullName || shipName || order.guestEmail || email || 'Guest customer';
    const custEmail = order.guestEmail || email || '';
    const isPos = order.source === 'pos';
    const payMethod = isPos
      ? (order.paymentMethod === 'card' ? 'Card' : 'Cash')
      : (order.paymentGateway === 'stripe' ? 'Stripe' : order.paymentGateway === 'cod' ? 'Cash on collection' : 'Online');
    const refNo = `${isPos ? 'POS' : 'ORD'}-${order.id}`;
    const memo = isPos
      ? `In-store sale (POS)${order.staffNote ? ' — ' + order.staffNote : ''}`
      : `Online order #${order.id} — ${order.collectionMode === 'collect' ? 'Click & Collect' : 'Delivery'}`;
    const orderItemsForOrder = itemsByOrder.get(order.id) || [];
    let lineTotal = 0;

    for (const li of orderItemsForOrder) {
      const qty = Number(li.qty);
      const rate = Number(li.unitPrice);
      const amount = +(qty * rate).toFixed(2);
      lineTotal += amount;
      out.push([
        fmtDate(order.createdAt),
        customer,
        custEmail,
        payMethod,
        refNo,
        depositTo,
        memo,
        defaultItem,
        `${li.name}${li.label ? ' — ' + li.label : ''}`,
        qty,
        rate.toFixed(2),
        amount.toFixed(2),
        '',
        isPos ? 'In-store' : 'Online',
      ].map(csv).join(','));
    }

    // Shipping line (only for delivery orders)
    const shipping = Number((order as any).shippingCost || 0);
    if (shipping > 0) {
      out.push([
        fmtDate(order.createdAt), customer, custEmail, payMethod, refNo, depositTo, memo,
        shippingItem, 'Delivery / postage', 1, shipping.toFixed(2), shipping.toFixed(2), '', isPos ? 'In-store' : 'Online',
      ].map(csv).join(','));
      lineTotal += shipping;
    }

    // Discount line (negative)
    const discount = Number((order as any).discount || 0);
    if (discount > 0) {
      out.push([
        fmtDate(order.createdAt), customer, custEmail, payMethod, refNo, depositTo, memo,
        discountItem, 'Discount applied', 1, (-discount).toFixed(2), (-discount).toFixed(2), '', isPos ? 'In-store' : 'Online',
      ].map(csv).join(','));
      lineTotal -= discount;
    }

    // If there are no items yet (shouldn't happen), emit a summary row so totals still appear
    if (orderItemsForOrder.length === 0 && shipping === 0 && discount === 0) {
      const total = Number(order.totalAmount);
      out.push([
        fmtDate(order.createdAt), customer, custEmail, payMethod, refNo, depositTo, memo,
        defaultItem, 'Order total', 1, total.toFixed(2), total.toFixed(2), '', isPos ? 'In-store' : 'Online',
      ].map(csv).join(','));
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(header.join(',') + '\n' + out.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="quickbooks-sales-${today}.csv"`,
    },
  });
}
