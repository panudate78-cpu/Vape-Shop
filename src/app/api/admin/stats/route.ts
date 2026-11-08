import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, productVariants, users } from '@/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

let ensuredCols = false;
async function ensurePosColumns() {
  if (ensuredCols) return;
  try {
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online'`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT`);
    ensuredCols = true;
  } catch (e) {
    console.warn('[stats] could not add POS columns:', (e as Error).message);
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await ensurePosColumns();

  const [rev] = await db.select({ v: sql<number>`coalesce(sum(${orders.totalAmount}),0)::float` })
    .from(orders).where(eq(orders.paymentStatus, 'paid'));
  const [revOnline] = await db.select({ v: sql<number>`coalesce(sum(${orders.totalAmount}),0)::float` })
    .from(orders).where(and(eq(orders.paymentStatus, 'paid'), sql`coalesce(${orders.source}, 'online') = 'online'`));
  const [revPos] = await db.select({ v: sql<number>`coalesce(sum(${orders.totalAmount}),0)::float` })
    .from(orders).where(and(eq(orders.paymentStatus, 'paid'), sql`${orders.source} = 'pos'`));
  const [cnt] = await db.select({ v: sql<number>`count(*)::int` }).from(orders).where(eq(orders.paymentStatus, 'paid'));
  const [cntPos] = await db.select({ v: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.paymentStatus, 'paid'), sql`${orders.source} = 'pos'`));
  const [pen] = await db.select({ v: sql<number>`count(*)::int` }).from(orders).where(eq(orders.status, 'pending'));

  const low = await db.select({
      id: productVariants.id, sku: productVariants.sku, flavor: productVariants.flavor,
      nicotineStrength: productVariants.nicotineStrength, bottleSize: productVariants.bottleSize,
      stockQuantity: productVariants.stockQuantity, lowStockThreshold: productVariants.lowStockThreshold,
      productName: sql<string>`(select name from products where id = ${productVariants.productId})`,
    }).from(productVariants)
    .where(and(eq(productVariants.isActive, true), sql`${productVariants.stockQuantity} <= ${productVariants.lowStockThreshold}`))
    .orderBy(productVariants.stockQuantity).limit(20);

  const recentRows = await db
    .select({ order: orders, userEmail: users.email, userFullName: users.fullName })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .orderBy(desc(orders.createdAt)).limit(10);
  const recent = recentRows.map((r) => ({
    ...r.order,
    customerEmail: r.order.guestEmail || r.userEmail || null,
    customerName: r.userFullName || null,
  }));

  return NextResponse.json({
    revenue: rev.v,
    revenueOnline: revOnline.v,
    revenuePos: revPos.v,
    paidOrders: cnt.v,
    posOrders: cntPos.v,
    onlineOrders: cnt.v - cntPos.v,
    pendingOrders: pen.v,
    lowStock: low,
    recent,
  });
}
