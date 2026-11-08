import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const rows = await db.select().from(orders)
    .where(status ? eq(orders.status, status) : undefined)
    .orderBy(desc(orders.createdAt)).limit(200);
  return NextResponse.json(rows);
}
