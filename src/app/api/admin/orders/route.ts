import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, users } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function ensureColumns() {
  // Belt-and-braces: make sure source/paymentMethod columns exist even on
  // older databases (e.g. local dev copies seeded before the POS split was
  // added). Production Neon already has these columns; ALTER TABLE IF NOT
  // EXISTS is a no-op when the column is present.
  try {
    await db.execute(sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'online'`);
    await db.execute(sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" text`);
  } catch {
    // Some DBs (SQLite via better-sqlite3) don't support ADD COLUMN IF NOT
    // EXISTS with defaults — fall through silently.
  }
}

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await ensureColumns();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const source = searchParams.get('source');

  const filters: any[] = [];
  if (status) filters.push(eq(orders.status, status));
  if (source === 'pos') filters.push(eq(orders.source, 'pos'));
  if (source === 'online') filters.push(sql`COALESCE(${orders.source}, 'online') <> 'pos'`);

  const rows = await db
    .select({
      order: orders,
      userEmail: users.email,
      userFullName: users.fullName,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(500);

  return NextResponse.json(rows.map((r) => ({
    ...r.order,
    // Backwards-compat: legacy rows without a source/payment_method get
    // sensible defaults so sourceBadge renders correctly.
    source: (r.order as any).source || 'online',
    paymentMethod: (r.order as any).paymentMethod || null,
    customerEmail: r.order.guestEmail || r.userEmail || null,
    customerName: r.userFullName || null,
  })));
}
