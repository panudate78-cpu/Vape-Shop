import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, payments } from '@/db/schema';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { verifyWebhook } from '@/lib/payments';
import { finalizeOnlinePayment, PaymentRejected } from '@/lib/stock';
import { deliverNotifications } from '@/lib/order-events';
import { recordEvent } from '@/lib/order-events';

// Payment notifications from the gateway. Safe to receive the same notification many times:
//  - a paid notification only ever claims an unpaid order (one payment row, one stock sale);
//  - a failed notification never changes an order that is already paid or refunded;
//  - a paid notification whose amount differs from the order total is rejected.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const wh = await verifyWebhook(body, Object.fromEntries(url.searchParams.entries()));
  if (!wh.verified) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  const orderId = Number(body.orderId);
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return NextResponse.json({ error: 'order not found' }, { status: 404 });
  const actor = `gateway:${order.paymentGateway || 'unknown'}`;

  if (wh.status === 'paid') {
    if (order.paymentStatus === 'paid') {
      await recordEvent(null, orderId, 'payment_duplicate', actor, { gatewayTransactionId: wh.paymentId, note: 'Already paid — notification ignored' });
      return NextResponse.json({ ok: true, duplicate: true });
    }
    if (body.amount != null) {
      const gotP = Math.round(Number(body.amount) * 100);
      const wantP = Math.round(Number(order.totalAmount) * 100);
      if (!Number.isFinite(gotP) || gotP !== wantP) {
        await recordEvent(null, orderId, 'payment_rejected', actor, { reason: 'amount_mismatch', received: body.amount, expected: order.totalAmount, gatewayTransactionId: wh.paymentId });
        return NextResponse.json({ error: 'amount mismatch' }, { status: 409 });
      }
    }
    try {
      const r = await finalizeOnlinePayment(orderId, { gatewayTransactionId: wh.paymentId, raw: body });
      if (r.alreadyPaid) {
        await recordEvent(null, orderId, 'payment_duplicate', actor, { gatewayTransactionId: wh.paymentId, note: 'Already paid — notification ignored' });
        return NextResponse.json({ ok: true, duplicate: true });
      }
    } catch (e: any) {
      if (e instanceof PaymentRejected) {
        await recordEvent(null, orderId, 'payment_rejected', actor, { reason: e.code, message: e.message, gatewayTransactionId: wh.paymentId });
        return NextResponse.json({ error: e.code.toLowerCase() }, { status: 409 });
      }
      console.error('[webhook] stock conflict after payment:', orderId, e?.message);
      await recordEvent(null, orderId, 'payment_rejected', actor, { reason: 'STOCK', message: e?.message, gatewayTransactionId: wh.paymentId });
      return NextResponse.json({ error: 'stock' }, { status: 409 });
    }
    deliverNotifications(orderId).catch((e) => console.error('[webhook] email delivery failed:', e));
    return NextResponse.json({ ok: true });
  }

  // Failed payment. Never downgrades a paid, refunded or partly refunded order.
  const updated = await db.update(orders)
    .set({ paymentStatus: 'failed', updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), ne(orders.paymentStatus, 'paid'), ne(orders.paymentStatus, 'refunded'), ne(orders.paymentStatus, 'partially_refunded')))
    .returning({ id: orders.id });
  if (updated.length) {
    // One failed-payment row per gateway transaction, however many times it is reported.
    const seen = await db.select({ id: payments.id }).from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, 'failed'), eq(payments.gatewayTransactionId, wh.paymentId)))
      .limit(1);
    if (!seen.length) {
      await db.insert(payments).values({ orderId, gateway: order.paymentGateway!, gatewayTransactionId: wh.paymentId, amount: order.totalAmount!, status: 'failed', raw: body });
    }
    await recordEvent(null, orderId, 'payment_failed', actor, { gatewayTransactionId: wh.paymentId, reason: body.reason ?? null });
  }
  return NextResponse.json({ ok: true });
}
