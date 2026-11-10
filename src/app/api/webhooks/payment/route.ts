import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, productVariants, promoCodes, payments } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { verifyWebhook } from '@/lib/payments';
import { sendOrderEmailsForOrder } from '@/lib/order-emails';
import { finalizeOnlinePayment } from '@/lib/stock';

// Real webhook endpoint. For mock gateway, the capture route does the same work.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const wh = await verifyWebhook(body, Object.fromEntries(url.searchParams.entries()));
  if (!wh.verified) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  const orderId = Number(body.orderId);
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return NextResponse.json({ error: 'order not found' }, { status: 404 });
  if (order.paymentStatus === 'paid') return NextResponse.json({ ok: true });

  if (wh.status === 'paid') {
    // Atomic: stock + order + promo + payment together. Retries are safe (no double deduction).
    try {
      const r = await finalizeOnlinePayment(orderId, { gatewayTransactionId: wh.paymentId, raw: body });
      if (r.alreadyPaid) return NextResponse.json({ ok: true });
    } catch (e: any) {
      console.error('[webhook] stock conflict after payment:', orderId, e?.message);
      return NextResponse.json({ error: 'stock' }, { status: 409 });
    }
    // Fire confirmation + admin-alert emails (idempotent; marks emails_sent_at).
    sendOrderEmailsForOrder(orderId).catch((e) => console.error('[webhook] email send failed:', e));
  } else {
    await db.update(orders).set({ paymentStatus: 'failed', updatedAt: new Date() }).where(eq(orders.id, orderId));
    await db.insert(payments).values({ orderId, gateway: order.paymentGateway!, gatewayTransactionId: wh.paymentId, amount: order.totalAmount!, status: 'failed', raw: body });
  }
  return NextResponse.json({ ok: true });
}
