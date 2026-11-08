import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getSession } from '@/lib/session';

export async function GET() {
  const s = await getSession();
  if (!s.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await db.select().from(orders).where(eq(orders.userId, s.user.id)).orderBy(desc(orders.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  // helper: guest lookup by order id + email
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const email = String(body.email || '').toLowerCase();
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const match = (o.userId && o.userId > 0 && (await getSession()).user?.id === o.userId)
    || (o.guestEmail && o.guestEmail.toLowerCase() === email);
  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
  return NextResponse.json({ order: o, items });
}
