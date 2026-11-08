import { NextResponse } from 'next/server';
import { db } from '@/db';
import { productVariants, products } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { z } from 'zod';

export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await db.select({
      v: productVariants, p: { name: products.name, brand: products.brand },
    })
    .from(productVariants)
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.isActive, true))
    .orderBy(products.brand, products.name, productVariants.flavor);
  return NextResponse.json(rows.map((r) => ({ ...r.v, productName: r.p?.name, brand: r.p?.brand })));
}

const patch = z.object({
  priceOverride: z.coerce.number().nonnegative().optional(),
  stockQuantity: z.coerce.number().int().nonnegative().optional(),
  lowStockThreshold: z.coerce.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const p = patch.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Bad' }, { status: 400 });
  const set: Record<string, any> = {};
  if (p.data.priceOverride !== undefined) set.priceOverride = p.data.priceOverride.toFixed(2);
  if (p.data.stockQuantity !== undefined) set.stockQuantity = p.data.stockQuantity;
  if (p.data.lowStockThreshold !== undefined) set.lowStockThreshold = p.data.lowStockThreshold;
  if (p.data.isActive !== undefined) set.isActive = p.data.isActive;
  const [v] = await db.update(productVariants).set(set).where(eq(productVariants.id, id)).returning();
  return NextResponse.json(v);
}
