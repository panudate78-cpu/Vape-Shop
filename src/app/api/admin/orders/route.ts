import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, users } from '@/db/schema';
import { eq, desc, and, sql, or } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'online'`);
    await db.execute(sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" text`);
  } catch {
    // Older databases may not support this form; the columns are added by the lazy migration anyway.
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Search: ?q= (order number, customer name or email), ?from=&to= (YYYY-MM-DD, UK calendar days),
// ?channel=online|pos, ?payment=, ?fulfilment=, plus legacy ?status= and ?source=.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await ensureColumns();

  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') || '').trim().replace(/^#/, '');
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';
  const channel = sp.get('channel') || sp.get('source') || '';
  const payment = sp.get('payment') || '';
  const fulfilment = sp.get('fulfilment') || '';
  const status = sp.get('status') || '';

  const filters: any[] = [];
  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => '\\' + m)}%`;
    const parts: any[] = [sql`${orders.guestEmail} ILIKE ${like}`, sql`${users.email} ILIKE ${like}`, sql`${users.fullName} ILIKE ${like}`];
    if (/^\d+$/.test(q)) parts.push(eq(orders.id, Number(q)));
    filters.push(or(...parts));
  }
  if (from && DATE.test(from)) filters.push(sql`${orders.createdAt} >= ${from}::date`);
  if (to && DATE.test(to)) filters.push(sql`${orders.createdAt} < (${to}::date + INTERVAL '1 day')`);
  if (channel === 'pos') filters.push(eq(orders.source, 'pos'));
  if (channel === 'online') filters.push(sql`COALESCE(${orders.source}, 'online') <> 'pos'`);
  if (payment) filters.push(eq(orders.paymentStatus, payment));
  if (fulfilment) filters.push(eq(orders.fulfilmentStatus, fulfilment));
  if (status) filters.push(eq(orders.status, status));

  const rows = await db
    .select({ order: orders, userEmail: users.email, userFullName: users.fullName })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(500);

  return NextResponse.json(rows.map((r) => ({
    ...r.order,
    source: (r.order as any).source || 'online',
    paymentMethod: (r.order as any).paymentMethod || null,
    customerEmail: r.order.guestEmail || r.userEmail || null,
    customerName: r.userFullName || null,
  })));
}
