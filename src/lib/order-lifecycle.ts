// Order fulfilment (what happens to the goods) and refunds (money back to the customer).
// Payment status is only changed by payments and refunds, never by a staff status dropdown.
import { db } from '@/db';
import { orders, orderItems, orderRefunds, orderRefundLines, payments, stockReservations } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { applyStockChange } from '@/lib/stock';
import { recordEvent, queueNotification, deliverNotifications } from '@/lib/order-events';
import { orderIsRestricted, recordAgeCheck } from '@/lib/compliance';

export type Fulfilment = 'unfulfilled' | 'processing' | 'ready' | 'shipped' | 'delivered' | 'collected' | 'cancelled';

export class OrderError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

// Allowed moves. Anything else is refused.
const NEXT: Record<Fulfilment, Fulfilment[]> = {
  unfulfilled: ['processing', 'cancelled'],
  processing: ['ready', 'shipped', 'cancelled'],
  ready: ['collected'],
  shipped: ['delivered'],
  delivered: [],
  collected: [],
  cancelled: [],
};

const toC = (n: number | string) => Math.round(Number(n) * 100);
const fromC = (c: number) => (c / 100).toFixed(2);
const PAID = ['paid', 'partially_refunded'];

// The old combined `status` column is still written so older screens and exports keep working.
export function legacyStatus(payment: string, fulfil: string): string {
  if (payment === 'refunded') return 'refunded';
  if (fulfil === 'cancelled') return 'cancelled';
  if (fulfil === 'collected') return 'collected';
  if (fulfil === 'delivered') return 'shipped';
  if (fulfil === 'ready' || fulfil === 'shipped' || fulfil === 'processing') return fulfil;
  return PAID.includes(payment) ? 'paid' : 'pending';
}

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : (r?.rows ?? []));

async function lockOrder(tx: any, orderId: number) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) throw new OrderError(404, 'Order not found');
  await tx.execute(sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);
  return o;
}

export type FulfilmentInput = {
  to?: Fulfilment;
  trackingNumber?: string | null;
  carrier?: string | null;
  collectedBy?: string | null;
  idChecked?: boolean;
  idType?: string | null;                                   // passport | uk_photocard_licence | pass_card | armed_forces | other
  ageRefusal?: { reasonCode: string; note?: string | null } | null; // refused at the door: recorded, status unchanged
  note?: string | null;
};

export async function updateFulfilment(orderId: number, input: FulfilmentInput, actor: string) {
  const outcome = await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    const from = o.fulfilmentStatus as Fulfilment;
    const to = (input.to ?? from) as Fulfilment;
    const isCollect = o.collectionMode === 'collect';
    const paid = PAID.includes(o.paymentStatus) || o.source === 'pos';
    const patch: Record<string, any> = { updatedAt: new Date() };
    const changes: Record<string, unknown> = {};
    const restricted = (to === 'collected' || to === 'delivered' || input.ageRefusal) ? await orderIsRestricted(tx, orderId) : false;
    const customer = { customerEmail: o.guestEmail ?? null, userId: o.userId ?? null };

    // Age refused at handover: recorded with the reason; the order stays where it is.
    if (input.ageRefusal) {
      if (to !== from) throw new OrderError(409, 'Record the refusal without changing the order status.', 'REFUSAL_WITH_MOVE');
      const onCounter = from === 'ready' && isCollect;
      const atDoor = from === 'shipped' && !isCollect;
      if (!onCounter && !atDoor) throw new OrderError(409, 'Refusals are recorded when handing over (ready for collection, or shipped for delivery).', 'BAD_STAGE');
      const channel = isCollect ? 'collection' : 'delivery';
      await recordAgeCheck(tx, {
        channel, result: 'refused', method: 'id_seen', idType: input.idType ?? null,
        reasonCode: input.ageRefusal.reasonCode, note: input.ageRefusal.note ?? null,
        staffName: actor, orderId, ...customer,
      });
      await recordEvent(tx, orderId, 'age_refused', actor, { channel, reason: input.ageRefusal.reasonCode, note: input.ageRefusal.note ?? undefined });
      return { from, to: from, queued: false, refused: true };
    }

    if (input.trackingNumber !== undefined) {
      patch.trackingNumber = input.trackingNumber?.trim() || null;
      changes.trackingNumber = patch.trackingNumber;
    }
    if (input.carrier !== undefined) {
      patch.carrier = input.carrier?.trim() || null;
      changes.carrier = patch.carrier;
    }

    if (to !== from) {
      if (!NEXT[from]?.includes(to)) throw new OrderError(409, `Cannot move from ${from} to ${to}.`, 'BAD_TRANSITION');
      if (to !== 'cancelled' && !paid) throw new OrderError(409, 'Payment has not been received for this order.', 'UNPAID');
      if (to === 'ready' && !isCollect) throw new OrderError(409, 'Only click & collect orders are marked ready for collection.', 'NOT_COLLECT');
      if (to === 'shipped' && isCollect) throw new OrderError(409, 'Collection orders are handed over, not shipped.', 'NOT_DELIVERY');
      if (to === 'shipped') {
        const tn = (input.trackingNumber ?? o.trackingNumber ?? '').trim();
        if (!tn) throw new OrderError(409, 'Add a tracking number before marking the order shipped.', 'NO_TRACKING');
        patch.shippedAt = new Date();
      }
      if (to === 'delivered') patch.deliveredAt = new Date();
      if (to === 'ready') patch.readyAt = new Date();
      if (to === 'collected') {
        const who = (input.collectedBy ?? '').trim();
        if (!who) throw new OrderError(409, 'Record the name of the person collecting.', 'NO_HANDOVER_NAME');
        if (input.idChecked !== true) throw new OrderError(409, 'Check photo ID (Challenge 25) before handing over.', 'NO_ID_CHECK');
        if (restricted && !input.idType) throw new OrderError(409, 'Record the type of ID shown.', 'NO_ID_TYPE');
        patch.collectedAt = new Date();
        patch.collectedBy = who;
        patch.idChecked = true;
        changes.collectedBy = who;
        changes.idChecked = true;
        // Collection checks are recorded separately from online checks.
        await recordAgeCheck(tx, {
          channel: 'collection', result: 'passed', method: 'id_seen', idType: input.idType ?? null,
          staffName: actor, orderId, ...customer,
        });
      }
      if (to === 'delivered' && restricted) {
        if (input.idChecked !== true) throw new OrderError(409, 'Check the recipient\'s photo ID before marking delivered (age-restricted items).', 'NO_ID_CHECK');
        const who = (input.collectedBy ?? '').trim();
        if (!who) throw new OrderError(409, 'Record the name of the person receiving the parcel.', 'NO_HANDOVER_NAME');
        if (!input.idType) throw new OrderError(409, 'Record the type of ID shown.', 'NO_ID_TYPE');
        changes.recipientName = who;
        changes.idChecked = true;
        await recordAgeCheck(tx, {
          channel: 'delivery', result: 'passed', method: 'id_seen', idType: input.idType,
          staffName: actor, orderId, ...customer,
        });
      }
      if (to === 'cancelled') {
        if (paid) throw new OrderError(409, 'This order is paid. Refund it instead of cancelling.', 'PAID');
        // Give back any stock held for this unpaid checkout.
        const holds = await tx.select().from(stockReservations)
          .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, 'active')));
        for (const h of holds) {
          await tx.execute(sql`UPDATE product_variants SET reserved_quantity = GREATEST(reserved_quantity - ${h.quantity}, 0) WHERE id = ${h.variantId}`);
          await tx.update(stockReservations).set({ status: 'released' }).where(eq(stockReservations.id, h.id));
        }
      }
      patch.fulfilmentStatus = to;
    }

    const newFulfil = to;
    patch.status = legacyStatus(o.paymentStatus, newFulfil);
    await tx.update(orders).set(patch).where(eq(orders.id, orderId));

    let queued = false;
    if (to !== from) {
      await recordEvent(tx, orderId, 'fulfilment', actor, { from, to, ...changes, note: input.note ?? undefined });
      if (to === 'ready' && isCollect) {
        const [who] = rowsOf(await tx.execute(sql`
          SELECT COALESCE(orders.guest_email, users.email) AS email FROM orders
          LEFT JOIN users ON users.id = orders.user_id WHERE orders.id = ${orderId}`));
        await queueNotification(tx, { orderId, kind: 'collection_ready', recipient: who?.email || '', dedupeKey: `collect:${orderId}` });
        queued = true;
      }
    } else if (Object.keys(changes).length) {
      await recordEvent(tx, orderId, 'tracking', actor, changes);
    }
    return { from, to, queued, refused: false };
  });

  if (outcome.queued) deliverNotifications(orderId).catch((e) => console.error('[fulfilment] notify failed', e));
  return outcome;
}

// ---------- refunds ----------

export type RefundLineInput = { orderItemId: number; quantity: number; restock: boolean };
export type RefundInput = {
  refundKey: string;
  lines: RefundLineInput[];
  includeShipping: boolean;
  reasonCode: string;
  reasonNote?: string | null;
  resolution: 'refund' | 'exchange';
  replacementOrderId?: number | null;
  method: 'original' | 'cash' | 'card' | 'manual';
};

export const REFUND_REASONS: Record<string, string> = {
  damaged: 'Damaged in transit or in store',
  faulty: 'Faulty / not working',
  wrong_item: 'Wrong item sent',
  not_as_described: 'Not as described',
  changed_mind: 'Changed mind',
  cancelled_order: 'Order cancelled',
  other: 'Other (see note)',
};

// Records a refund for a paid order. Everything happens in one transaction, under a row lock
// on the order, so two refunds for the same order cannot overlap, and a repeated refundKey
// returns the first result without refunding again.
export async function refundOrder(orderId: number, input: RefundInput, actor: { name: string; id?: number | null }) {
  if (!REFUND_REASONS[input.reasonCode]) throw new OrderError(400, 'Choose a refund reason.');
  if (input.reasonCode === 'other' && !(input.reasonNote ?? '').trim()) throw new OrderError(400, 'Add a note for "Other".');

  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);

    const [dup] = await tx.select({ id: orderRefunds.id, amount: orderRefunds.amount }).from(orderRefunds).where(eq(orderRefunds.refundKey, input.refundKey)).limit(1);
    if (dup) return { duplicate: true as const, refundId: dup.id, amount: dup.amount };

    if (o.source === 'pos') throw new OrderError(409, 'In-store sales are refunded from the Till (POS).', 'POS_ORDER');
    if (!PAID.includes(o.paymentStatus)) throw new OrderError(409, `Only paid orders can be refunded (payment is ${o.paymentStatus}).`, 'NOT_PAID');
    if (!input.lines.length && !input.includeShipping) throw new OrderError(400, 'Choose at least one item or shipping to refund.');

    let replacementOrderId: number | null = null;
    if (input.resolution === 'exchange') {
      if (!input.replacementOrderId) throw new OrderError(400, 'Link the replacement sale for an exchange.');
      const [rep] = await tx.select({ id: orders.id, parent: orders.parentOrderId }).from(orders).where(eq(orders.id, input.replacementOrderId)).limit(1);
      if (!rep || rep.id === orderId || rep.parent) throw new OrderError(400, 'Replacement must be a different sale.');
      replacementOrderId = rep.id;
    }

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const refundedRows = rowsOf(await tx.execute(sql`
      SELECT l.order_item_id AS item, SUM(l.quantity)::int AS qty FROM order_refund_lines l
      JOIN order_refunds r ON r.id = l.refund_id WHERE r.order_id = ${orderId} GROUP BY l.order_item_id`));
    const refundedQty = new Map<number, number>(refundedRows.map((r: any) => [Number(r.item), Number(r.qty)]));
    const [shipRow] = rowsOf(await tx.execute(sql`SELECT COUNT(*)::int AS n FROM order_refunds WHERE order_id = ${orderId} AND include_shipping = TRUE`));
    const shippingAlreadyRefunded = Number(shipRow?.n ?? 0) > 0;
    if (input.includeShipping && shippingAlreadyRefunded) throw new OrderError(409, 'Shipping has already been refunded.', 'SHIPPING_DONE');

    // Each item's share of the basket discount, so refunds match what the customer paid.
    const grossC = items.reduce((t, i) => t + toC(i.unitPrice) * i.quantity, 0);
    const discountC = toC(o.discount);
    const ratio = grossC > 0 ? Math.max(0, grossC - discountC) / grossC : 1;

    const requested = new Map<number, number>();
    let amountC = 0;
    const lineRows: { orderItemId: number; variantId: number | null; quantity: number; amountC: number; restock: boolean; name: string }[] = [];
    for (const l of input.lines) {
      if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new OrderError(400, 'Quantities must be whole numbers of 1 or more.');
      if (requested.has(l.orderItemId)) throw new OrderError(400, 'Each item can only appear once in a refund.');
      const it = items.find((i) => i.id === l.orderItemId);
      if (!it) throw new OrderError(400, `Item ${l.orderItemId} is not on this order.`);
      const left = it.quantity - (refundedQty.get(it.id) ?? 0);
      if (l.quantity > left) throw new OrderError(409, `${it.productName}: only ${left} left to refund.`, 'OVER_REFUND');
      requested.set(it.id, l.quantity);
      const lineC = Math.round(toC(it.unitPrice) * l.quantity * ratio);
      amountC += lineC;
      lineRows.push({ orderItemId: it.id, variantId: it.variantId ?? null, quantity: l.quantity, amountC: lineC, restock: !!l.restock, name: `${it.productName} (${it.variantLabel})` });
    }
    const shippingC = input.includeShipping ? toC(o.shippingCost) : 0;
    amountC += shippingC;
    if (amountC <= 0) throw new OrderError(400, 'Nothing to refund.');

    const totalC = toC(o.totalAmount);
    const refundedBeforeC = toC(o.refundedAmount);
    const remainingC = totalC - refundedBeforeC;
    if (amountC > remainingC) throw new OrderError(409, `That refund is £${fromC(amountC)} but only £${fromC(remainingC)} can still be refunded.`, 'OVER_REFUND');

    const allItemsDone = items.every((i) => (refundedQty.get(i.id) ?? 0) + (requested.get(i.id) ?? 0) === i.quantity);
    const shippingDone = shippingAlreadyRefunded || input.includeShipping || toC(o.shippingCost) === 0;
    const fullyRefunded = allItemsDone && shippingDone;
    // A final refund takes the order to exactly its total, so rounding never leaves pennies behind.
    if (fullyRefunded) amountC = remainingC;
    const newPayment = fullyRefunded ? 'refunded' : 'partially_refunded';
    const newFulfil: string = fullyRefunded && ['unfulfilled', 'processing', 'ready'].includes(o.fulfilmentStatus) ? 'cancelled' : o.fulfilmentStatus;

    const [ref] = await tx.insert(orderRefunds).values({
      orderId, refundKey: input.refundKey, amount: fromC(amountC), reasonCode: input.reasonCode,
      reasonNote: input.reasonNote?.trim() || null, resolution: input.resolution, replacementOrderId,
      method: input.method, includeShipping: input.includeShipping, createdBy: actor.name,
    } as any).returning({ id: orderRefunds.id });

    for (const l of lineRows) {
      await tx.insert(orderRefundLines).values({
        refundId: ref.id, orderItemId: l.orderItemId, variantId: l.variantId, quantity: l.quantity,
        amount: fromC(l.amountC), restock: l.restock,
      });
      // Resellable: goods go back on the shelf. Not resellable: they leave stock for good, which is
      // recorded on the refund line rather than as a stock movement.
      if (l.restock && l.variantId != null) {
        await applyStockChange(tx, {
          variantId: l.variantId, delta: l.quantity, reason: 'return', actor: actor.name, orderId,
          refKey: `refund:${ref.id}:item:${l.orderItemId}`, note: `Refund #${ref.id} on order #${orderId}: ${REFUND_REASONS[input.reasonCode]}`,
        });
      }
    }

    const gatewayNote = o.paymentGateway && o.paymentGateway !== 'mock' && input.method === 'original'
      ? 'Card refund must be completed in the payment provider dashboard. It is not sent automatically yet.'
      : null;

    await tx.insert(payments).values({
      orderId, gateway: o.paymentGateway || 'manual', gatewayTransactionId: `refund:${ref.id}`,
      amount: fromC(-amountC), status: 'refunded', raw: { method: input.method, reasonCode: input.reasonCode, refundId: ref.id } as any,
    });

    await tx.update(orders).set({
      refundedAmount: fromC(refundedBeforeC + amountC),
      paymentStatus: newPayment,
      fulfilmentStatus: newFulfil,
      status: legacyStatus(newPayment, newFulfil),
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    if (newFulfil !== o.fulfilmentStatus) {
      await recordEvent(tx, orderId, 'fulfilment', actor.name, { from: o.fulfilmentStatus, to: newFulfil, reason: 'fully refunded' });
    }
    await recordEvent(tx, orderId, 'refund', actor.name, {
      refundId: ref.id, amount: fromC(amountC), reasonCode: input.reasonCode, reason: REFUND_REASONS[input.reasonCode],
      reasonNote: input.reasonNote?.trim() || null, resolution: input.resolution, replacementOrderId,
      method: input.method, includeShipping: input.includeShipping, paymentStatus: newPayment, fulfilmentStatus: newFulfil,
      lines: lineRows.map((l) => ({ item: l.name, quantity: l.quantity, amount: fromC(l.amountC), restock: l.restock })),
      gatewayNote,
    });

    return { duplicate: false as const, refundId: ref.id, amount: fromC(amountC), paymentStatus: newPayment, fulfilmentStatus: newFulfil, gatewayNote };
  });
}

// Used by the Till when it refunds a POS sale: the return is already a separate order, so this
// only adds the refund record, updates the original sale's totals and writes the history.
export async function recordTillRefund(tx: any, p: {
  originalOrderId: number; returnOrderId: number; amountC: number; method: string;
  reasonCode: string; reasonNote: string; resellable: boolean; actor: string;
  lines: { orderItemId: number; variantId: number | null; quantity: number; amountC: number }[];
}) {
  const [orig] = await tx.select().from(orders).where(eq(orders.id, p.originalOrderId)).limit(1);
  const refundedBeforeC = toC(orig.refundedAmount ?? '0');
  const totalC = toC(orig.totalAmount);
  const refundedAfterC = refundedBeforeC + p.amountC;
  const newPayment = refundedAfterC >= totalC ? 'refunded' : 'partially_refunded';
  const [ref] = await tx.insert(orderRefunds).values({
    orderId: p.originalOrderId, refundKey: `till-return:${p.returnOrderId}`, amount: fromC(p.amountC),
    reasonCode: p.reasonCode, reasonNote: p.reasonNote || null, resolution: 'refund', replacementOrderId: null,
    method: p.method, includeShipping: false, createdBy: p.actor,
  } as any).returning({ id: orderRefunds.id });
  for (const l of p.lines) {
    await tx.insert(orderRefundLines).values({
      refundId: ref.id, orderItemId: l.orderItemId, variantId: l.variantId, quantity: l.quantity,
      amount: fromC(l.amountC), restock: p.resellable,
    });
  }
  await tx.update(orders).set({
    refundedAmount: fromC(refundedAfterC), paymentStatus: newPayment, status: legacyStatus(newPayment, orig.fulfilmentStatus),
    updatedAt: new Date(),
  }).where(eq(orders.id, p.originalOrderId));
  await recordEvent(tx, p.originalOrderId, 'refund', p.actor, {
    refundId: ref.id, amount: fromC(p.amountC), reasonCode: p.reasonCode, reason: REFUND_REASONS[p.reasonCode] ?? p.reasonCode,
    reasonNote: p.reasonNote || null, method: p.method, returnOrderId: p.returnOrderId, resellable: p.resellable,
    paymentStatus: newPayment, source: 'till',
  });
  return ref.id;
}

