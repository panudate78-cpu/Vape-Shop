import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, productVariants, promoCodes, payments } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { captureMockPayment } from '@/lib/payments';
import { getSession } from '@/lib/session';

// For mock gateway: finalize payment and deduct stock (same effect as a verified webhook).
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.paymentStatus === 'paid') return NextResponse.json({ ok: true, orderId: id });
  if (order.paymentGateway !== 'mock') return NextResponse.json({ error: 'Use webhook for non-mock gateways' }, { status: 400 });

  const res = await captureMockPayment(order.paymentIntentId || 'mock');
  if (!res.success) return NextResponse.json({ error: 'Payment failed' }, { status: 402 });

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const variantIds = items.map((i) => i.variantId).filter((x): x is number => x != null);
  const variants = await db.select().from(productVariants).where(inArray(productVariants.id, variantIds));
  for (const it of items) {
    const v = variants.find((x) => x.id === it.variantId);
    if (!v || v.stockQuantity < it.quantity) return NextResponse.json({ error: `Insufficient stock for ${it.productName}` }, { status: 409 });
  }
  for (const it of items) {
    await db.update(productVariants).set({ stockQuantity: sql`${productVariants.stockQuantity} - ${it.quantity}` }).where(eq(productVariants.id, it.variantId!));
  }
  await db.update(orders).set({ paymentStatus: 'paid', status: 'processing', updatedAt: new Date() }).where(eq(orders.id, id));
  if (order.promoCode) {
    await db.update(promoCodes).set({ timesUsed: sql`${promoCodes.timesUsed} + 1` }).where(eq(promoCodes.code, order.promoCode));
  }
  await db.insert(payments).values({ orderId: id, gateway: order.paymentGateway!, gatewayTransactionId: res.paymentId, amount: order.totalAmount!, status: 'paid', raw: { mock: true } });

  const s = await getSession();
  if (s) { s.cart = []; await s.save(); }

  return NextResponse.json({ ok: true, orderId: id });
}
