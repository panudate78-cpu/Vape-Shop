import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { productBlocks, productVariants, products, orders, orderItems } from '@/db/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { requireStaff } from '@/lib/session';
import { can } from '@/lib/staff';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Stop-sale (block) and recall. Both stop new online and till sales of the product.
// A recall also lists the orders that contain it, so the shop can contact those customers.
const schema = z.object({
  kind: z.enum(['block', 'recall']),
  scope: z.enum(['variant', 'product']),
  variantId: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  reason: z.string().trim().min(5).max(300),
});

export async function GET(req: Request) {
  const u = await requireStaff();
  if (!u || !can(u.role, 'compliance.view')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const status = new URL(req.url).searchParams.get('status') || 'active';
  const rows = await db
    .select({ b: productBlocks, variantSku: productVariants.sku, productName: products.name })
    .from(productBlocks)
    .leftJoin(productVariants, eq(productVariants.id, productBlocks.variantId))
    .leftJoin(products, eq(products.id, productBlocks.productId))
    .where(status === 'all' ? undefined : eq(productBlocks.status, 'active'))
    .orderBy(desc(productBlocks.createdAt))
    .limit(200);
  return NextResponse.json(rows.map((r) => ({ ...r.b, variantSku: r.variantSku, productName: r.productName })));
}

export async function POST(req: Request) {
  const u = await requireStaff();
  if (!u || !can(u.role, 'compliance.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'Invalid block', issues: p.error.flatten() }, { status: 400 });
  const d = p.data;

  // Work out which variants this covers.
  let variantIds: number[] = [];
  if (d.scope === 'variant') {
    if (!d.variantId) return NextResponse.json({ error: 'Choose a variant' }, { status: 400 });
    const [v] = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.id, d.variantId)).limit(1);
    if (!v) return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    variantIds = [v.id];
  } else {
    if (!d.productId) return NextResponse.json({ error: 'Choose a product' }, { status: 400 });
    const vs = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, d.productId));
    if (!vs.length) return NextResponse.json({ error: 'Product not found or has no variants' }, { status: 404 });
    variantIds = vs.map((x) => x.id);
  }

  const [row] = await db.insert(productBlocks).values({
    kind: d.kind, scope: d.scope, variantId: d.scope === 'variant' ? d.variantId! : null,
    productId: d.scope === 'product' ? d.productId! : null, reason: d.reason, createdBy: u.fullName || u.email,
  }).returning();

  // Orders that contain this product in the last 12 months, excluding cancelled ones.
  const affected = await db
    .selectDistinct({
      id: orders.id, createdAt: orders.createdAt, guestEmail: orders.guestEmail, userId: orders.userId,
      fulfilmentStatus: orders.fulfilmentStatus, paymentStatus: orders.paymentStatus,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(
      inArray(orderItems.variantId, variantIds),
      sql`${orders.createdAt} > now() - interval '365 days'`,
      sql`${orders.fulfilmentStatus} <> 'cancelled'`,
    ))
    .orderBy(desc(orders.createdAt))
    .limit(500);

  await audit(u, `compliance.${d.kind}`, d.scope, d.scope === 'variant' ? d.variantId! : d.productId!, { reason: d.reason, affectedOrders: affected.length });
  return NextResponse.json({ ok: true, block: row, affectedOrders: d.kind === 'recall' ? affected : undefined, affectedCount: affected.length });
}
