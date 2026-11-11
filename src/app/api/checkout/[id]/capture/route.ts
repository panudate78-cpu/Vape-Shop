import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, productVariants, promoCodes, payments } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { captureMockPayment } from '@/lib/payments';
import { getSession } from '@/lib/session';
import { deliverNotifications } from '@/lib/order-events';
import { finalizeOnlinePayment, PaymentRejected } from '@/lib/stock';

// For mock gateway: finalize payment and deduct stock (same effect as a verified webhook).
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  // Not found and not yours look the same, so order numbers cannot be probed.
  const s = await getSession();
  const mine = (order?.userId != null && s.user?.id === order.userId) || (s.pendingOrderIds ?? []).includes(id);
  const owner = s.user?.role === 'ADMIN';
  if (!order || (!mine && !owner)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.paymentStatus === 'paid') return NextResponse.json({ ok: true, orderId: id });
  if (order.paymentGateway !== 'mock') return NextResponse.json({ error: 'Use webhook for non-mock gateways' }, { status: 400 });

  const res = await captureMockPayment(order.paymentIntentId || 'mock');
  if (!res.success) return NextResponse.json({ error: 'Payment failed' }, { status: 402 });

  // Stock, order status, promo usage and payment record change together or not at all.
  try {
    await finalizeOnlinePayment(id, { gatewayTransactionId: res.paymentId, raw: { mock: true } });
  } catch (e: any) {
    if (e instanceof PaymentRejected) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error('[capture] stock conflict after payment:', id, e?.message);
    return NextResponse.json({ error: e?.message || 'Insufficient stock' }, { status: 409 });
  }

  s.cart = [];
  await s.save();

  // Fire-and-forget emails (don't fail checkout if email delivery fails).
  deliverNotifications(id).catch((e) => console.error('[capture] email send failed:', e));

  return NextResponse.json({ ok: true, orderId: id });
}
