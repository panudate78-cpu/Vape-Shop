import { db, dbReady } from '@/db';
import { recordEvent, queueNotification } from '@/lib/order-events';
import { productVariants, stockMovements, stockReservations, stockBatches, orders, orderItems, payments, promoCodes } from '@/db/schema';
import { and, asc, eq, gt, ne, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Single stock record + movement ledger.
//
// Rules this module enforces:
//  * product_variants.stock_quantity is the ONE on-hand figure used by the
//    website, the till and admin. Nothing else writes it.
//  * Every change is a row in stock_movements (who, when, why, delta, before/after).
//  * Each business event (refKey) applies at most once, even if retried.
//  * Units held by in-progress web checkouts (reserved_quantity) can't be sold
//    by the till or by another checkout. stock >= reserved always holds.
//  * Changes lock the variant row (SELECT ... FOR UPDATE) inside a transaction,
//    so two concurrent sales of the last unit cannot both succeed.
// ---------------------------------------------------------------------------

export class StockError extends Error {
  status = 409;
  constructor(message: string) { super(message); this.name = 'StockError'; }
}

export type StockReason =
  | 'sale_online' | 'sale_till' | 'return' | 'delivery' | 'damage' | 'loss'
  | 'stock_count' | 'recall' | 'correction';

// Reasons that take stock out of specific batches (first-expiry, first-out).
const BATCH_CONSUMING = new Set<StockReason>(['sale_online', 'sale_till', 'damage', 'loss', 'stock_count', 'recall', 'correction']);

export type StockChange = {
  variantId: number;
  delta: number;            // +in / -out
  reason: StockReason;
  actor: string;            // email or 'website' / 'system'
  note?: string | null;
  refKey?: string;          // idempotency key for the business event
  orderId?: number | null;
  poId?: number | null;
  stocktakeId?: number | null;
  batchCode?: string | null;   // on delivery: batch/lot number
  expiryDate?: string | null;  // on delivery: YYYY-MM-DD
  unitCost?: number | null;    // on delivery: cost of this batch
  batchId?: number | null;     // recall: take from this batch only
};

export type StockResult = { skipped: boolean; before: number; after: number };

export const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : (r?.rows ?? []));

/** Apply one stock change inside an open transaction `tx`. */
export async function applyStockChange(tx: any, c: StockChange): Promise<StockResult> {
  const [locked] = rowsOf(await tx.execute(sql`
    SELECT stock_quantity AS s, reserved_quantity AS r FROM product_variants
    WHERE id = ${c.variantId} FOR UPDATE`));
  if (!locked) throw new StockError(`Variant ${c.variantId} not found`);
  const before = Number(locked.s);
  const reserved = Number(locked.r);

  if (c.refKey) {
    const seen = rowsOf(await tx.execute(sql`SELECT 1 FROM stock_movements WHERE ref_key = ${c.refKey} LIMIT 1`));
    if (seen.length) return { skipped: true, before, after: before };
  }
  if (c.delta === 0) return { skipped: true, before, after: before };

  const after = before + c.delta;
  if (c.delta < 0 && after - reserved < 0) {
    const available = Math.max(0, before - reserved);
    throw new StockError(`Not enough stock: ${available} available${reserved ? ` (${reserved} held for checkouts)` : ''}`);
  }

  // ----- batch slices -----
  type Slice = { delta: number; batchId: number | null };
  const slices: Slice[] = [];
  if (c.delta > 0) {
    let batchId: number | null = null;
    if (c.reason === 'delivery') {
      const [b] = await tx.insert(stockBatches).values({
        variantId: c.variantId,
        batchCode: c.batchCode || `B${Date.now().toString(36).toUpperCase()}`,
        expiryDate: c.expiryDate || null,
        qtyReceived: c.delta,
        qtyRemaining: c.delta,
        unitCost: c.unitCost != null ? String(c.unitCost) : null,
        poId: c.poId ?? null,
      }).returning({ id: stockBatches.id });
      batchId = b.id;
    }
    slices.push({ delta: c.delta, batchId });
  } else {
    let need = -c.delta;
    if (c.batchId) {
      // Explicit batch (recall): take only from that batch.
      const [b] = await tx.select().from(stockBatches).where(eq(stockBatches.id, c.batchId));
      const take = Math.min(need, Number(b?.qtyRemaining ?? 0));
      if (take > 0) {
        await tx.update(stockBatches).set({ qtyRemaining: sql`${stockBatches.qtyRemaining} - ${take}` }).where(eq(stockBatches.id, c.batchId));
        slices.push({ delta: -take, batchId: c.batchId });
        need -= take;
      }
    } else if (BATCH_CONSUMING.has(c.reason)) {
      const batches = await tx.select().from(stockBatches).where(and(
        eq(stockBatches.variantId, c.variantId), gt(stockBatches.qtyRemaining, 0), eq(stockBatches.recalled, false),
      )).orderBy(sql`${stockBatches.expiryDate} ASC NULLS LAST`, asc(stockBatches.receivedAt));
      for (const b of batches) {
        if (need <= 0) break;
        const take = Math.min(need, b.qtyRemaining);
        await tx.update(stockBatches).set({ qtyRemaining: sql`${stockBatches.qtyRemaining} - ${take}` }).where(eq(stockBatches.id, b.id));
        slices.push({ delta: -take, batchId: b.id });
        need -= take;
      }
    }
    if (need > 0) slices.push({ delta: -need, batchId: null }); // untracked stock (pre-batch history)
  }

  // ----- stock + ledger -----
  await tx.update(productVariants).set({ stockQuantity: after }).where(eq(productVariants.id, c.variantId));
  let running = before;
  for (const s of slices) {
    const qb = running; running += s.delta;
    await tx.insert(stockMovements).values({
      variantId: c.variantId, delta: s.delta, qtyBefore: qb, qtyAfter: running,
      reason: c.reason, actor: c.actor, note: c.note ?? null,
      orderId: c.orderId ?? null, poId: c.poId ?? null, stocktakeId: c.stocktakeId ?? null,
      batchId: s.batchId, refKey: c.refKey ?? null,
    });
  }
  return { skipped: false, before, after };
}

/** Run one stock change in its own transaction. */
export async function changeStock(c: StockChange): Promise<StockResult> {
  return db.transaction(async (tx) => applyStockChange(tx, c));
}

// ---------------------------------------------------------------------------
// Reservations for web checkout
// ---------------------------------------------------------------------------

export const RESERVATION_MINUTES = Number(process.env.STOCK_RESERVATION_MINUTES || 20);

/** Atomically reserve every line of an order, or none of them. */
export async function reserveForOrder(orderId: number, lines: { variantId: number; quantity: number; productName: string }[]) {
  await dbReady();
  await releaseExpiredReservations();
  const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60_000);
  await db.transaction(async (tx) => {
    const sorted = [...lines].sort((a, b) => a.variantId - b.variantId); // consistent lock order
    for (const l of sorted) {
      const res = rowsOf(await tx.execute(sql`
        UPDATE product_variants SET reserved_quantity = reserved_quantity + ${l.quantity}
        WHERE id = ${l.variantId} AND stock_quantity - reserved_quantity >= ${l.quantity}
        RETURNING id`));
      if (!res.length) throw new StockError(`${l.productName} is no longer available in that quantity`);
      await tx.insert(stockReservations).values({ orderId, variantId: l.variantId, quantity: l.quantity, status: 'active', expiresAt });
    }
  });
}

/**
 * Release reservations whose checkout was abandoned. Their orders are cancelled
 * only if still unpaid. Safe to call often: each row is claimed with SKIP LOCKED.
 */
export async function releaseExpiredReservations(): Promise<number> {
  return db.transaction(async (tx) => {
    const expired = rowsOf(await tx.execute(sql`
      SELECT id, order_id, variant_id, quantity FROM stock_reservations
      WHERE status = 'active' AND expires_at < NOW()
      FOR UPDATE SKIP LOCKED`));
    const orderIds = new Set<number>();
    for (const r of expired) {
      await tx.execute(sql`UPDATE product_variants SET reserved_quantity = GREATEST(reserved_quantity - ${r.quantity}, 0) WHERE id = ${r.variant_id}`);
      await tx.execute(sql`UPDATE stock_reservations SET status = 'released' WHERE id = ${r.id}`);
      orderIds.add(Number(r.order_id));
    }
    for (const oid of orderIds) {
      await tx.update(orders).set({ status: 'cancelled', paymentStatus: 'failed', updatedAt: new Date() })
        .where(and(eq(orders.id, oid), eq(orders.paymentStatus, 'pending')));
    }
    return expired.length;
  });
}

/**
 * Called once a payment is confirmed (webhook or mock capture). Everything
 * happens in ONE transaction: mark paid (only if not already paid), convert the
 * reservations into sales, write the ledger, record the payment. If stock can't
 * be honoured the whole thing rolls back and the order stays unpaid.
 */
export async function finalizeOnlinePayment(orderId: number, p: { gatewayTransactionId: string; raw: unknown }) {
  await dbReady();
  return db.transaction(async (tx) => {
    // Only an unpaid, uncancelled order can be claimed. Staff-cancelled orders must not take money.
    const claimed = await tx.update(orders)
      .set({ paymentStatus: 'paid', status: 'paid', updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), ne(orders.paymentStatus, 'paid'), ne(orders.paymentStatus, 'refunded'), ne(orders.fulfilmentStatus, 'cancelled')))
      .returning({ id: orders.id, promoCode: orders.promoCode, totalAmount: orders.totalAmount, paymentGateway: orders.paymentGateway });
    if (!claimed.length) {
      const [cur] = await tx.select({ ps: orders.paymentStatus, fs: orders.fulfilmentStatus }).from(orders).where(eq(orders.id, orderId)).limit(1);
      if (cur?.ps === 'paid') return { alreadyPaid: true as const };
      if (cur?.fs === 'cancelled') throw new PaymentRejected('ORDER_CANCELLED', 'Order was cancelled before payment arrived. Refund the payment.');
      throw new PaymentRejected('NOT_PAYABLE', `Order is ${cur?.ps ?? 'missing'} and cannot be paid.`);
    }
    const order = claimed[0];

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const holds = await tx.select().from(stockReservations).where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, 'active')));

    for (const it of items) {
      if (it.variantId == null) continue;
      const hold = holds.find((h) => h.variantId === it.variantId);
      if (hold) {
        // Release the hold as it converts into a sale (same quantity).
        await tx.execute(sql`UPDATE product_variants SET reserved_quantity = GREATEST(reserved_quantity - ${hold.quantity}, 0) WHERE id = ${it.variantId}`);
        await tx.update(stockReservations).set({ status: 'consumed' }).where(eq(stockReservations.id, hold.id));
      }
      // If the hold had expired, this falls back to a plain availability check and may throw.
      await applyStockChange(tx, {
        variantId: it.variantId, delta: -it.quantity, reason: 'sale_online', actor: 'website',
        orderId, refKey: `sale:online:${orderId}:${it.variantId}`,
      });
    }

    if (order.promoCode) {
      await tx.update(promoCodes).set({ timesUsed: sql`${promoCodes.timesUsed} + 1` }).where(eq(promoCodes.code, order.promoCode));
    }
    await tx.insert(payments).values({
      orderId, gateway: order.paymentGateway!, gatewayTransactionId: p.gatewayTransactionId,
      amount: order.totalAmount!, status: 'paid', raw: p.raw as any,
    });
    await recordEvent(tx, orderId, 'payment_paid', 'payment', { gatewayTransactionId: p.gatewayTransactionId, amount: order.totalAmount });
    // Queued in the same transaction as the payment, so a paid order always has its emails queued.
    const [who] = rowsOf(await tx.execute(sql`
      SELECT COALESCE(orders.guest_email, users.email) AS email FROM orders
      LEFT JOIN users ON users.id = orders.user_id WHERE orders.id = ${orderId}`));
    await queueNotification(tx, { orderId, kind: 'order_confirmation', recipient: who?.email || '', dedupeKey: `confirm:${orderId}` });
    await queueNotification(tx, { orderId, kind: 'admin_new_order', recipient: 'admins', dedupeKey: `admin:${orderId}` });
    return { alreadyPaid: false as const };
  });
}

export class PaymentRejected extends Error {
  constructor(public code: string, message: string) { super(message); }
}
