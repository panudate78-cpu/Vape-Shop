import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, users } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const rows = await db
    .select({
      order: orders,
      userEmail: users.email,
      userFullName: users.fullName,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(status ? eq(orders.status, status) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(200);

  return NextResponse.json(rows.map((r) => ({
    ...r.order,
    customerEmail: r.order.guestEmail || r.userEmail || null,
    customerName: r.userFullName || null,
  })));
}
