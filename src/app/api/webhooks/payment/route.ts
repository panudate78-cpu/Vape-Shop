import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, productVariants, promoCodes, payments } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { verifyWebhook } from '@/lib/payments';

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
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const variantIds = items.map((i) => i.variantId).filter((x): x is number => x != null);
    const variants = await db.select().from(productVariants).where(inArray(productVariants.id, variantIds));
    for (const it of items) {
      const v = variants.find((x) => x.id === it.variantId);
      if (!v || v.stockQuantity < it.quantity) return NextResponse.json({ error: 'stock' }, { status: 409 });
    }
    for (const it of items) {
      await db.update(productVariants).set({ stockQuantity: sql`${productVariants.stockQuantity} - ${it.quantity}` }).where(eq(productVariants.id, it.variantId!));
    }
    await db.update(orders).set({ paymentStatus: 'paid', status: 'processing', updatedAt: new Date() }).where(eq(orders.id, orderId));
    if (order.promoCode) await db.update(promoCodes).set({ timesUsed: sql`${promoCodes.timesUsed} + 1` }).where(eq(promoCodes.code, order.promoCode));
    await db.insert(payments).values({ orderId, gateway: order.paymentGateway!, gatewayTransactionId: wh.paymentId, amount: order.totalAmount!, status: 'paid', raw: body });
  } else {
    await db.update(orders).set({ paymentStatus: 'failed', updatedAt: new Date() }).where(eq(orders.id, orderId));
    await db.insert(payments).values({ orderId, gateway: order.paymentGateway!, gatewayTransactionId: wh.paymentId, amount: order.totalAmount!, status: 'failed', raw: body });
  }
  return NextResponse.json({ ok: true });
}
