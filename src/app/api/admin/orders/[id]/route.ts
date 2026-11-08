import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { z } from 'zod';

const patch = z.object({
  status: z.enum(['pending', 'paid', 'processing', 'ready', 'shipped', 'collected', 'cancelled', 'refunded']).optional(),
  trackingNumber: z.string().max(64).optional().nullable(),
  carrier: z.string().max(64).optional().nullable(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(params.id);
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return NextResponse.json({ order: o, items });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(params.id);
  const body = await req.json().catch(() => ({}));
  const p = patch.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Bad' }, { status: 400 });
  const [o] = await db.update(orders).set({ ...p.data, updatedAt: new Date() }).where(eq(orders.id, id)).returning();
  return NextResponse.json(o);
}
