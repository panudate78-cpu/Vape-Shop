import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { canViewOrder } from '@/lib/order-access';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const s = await getSession();
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewOrder(s, o)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return NextResponse.json({ order: o, items });
}
