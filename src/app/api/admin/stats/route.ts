import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, productVariants, users } from '@/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [rev] = await db.select({ v: sql<number>`coalesce(sum(${orders.totalAmount}),0)::float` })
    .from(orders).where(eq(orders.paymentStatus, 'paid'));
  const [cnt] = await db.select({ v: sql<number>`count(*)::int` }).from(orders).where(eq(orders.paymentStatus, 'paid'));
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

  return NextResponse.json({ revenue: rev.v, paidOrders: cnt.v, pendingOrders: pen.v, lowStock: low, recent });
}
