import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, productVariants, categories } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requireOwner } from '@/lib/session';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(1), brand: z.string().min(1), categoryId: z.coerce.number(),
  description: z.string().default(''), basePrice: z.coerce.number().nonnegative(),
  vgPgRatio: z.string().default('70/30'), flavorProfile: z.string().default(''),
  tags: z.array(z.string()).default([]), isActive: z.boolean().default(true),
});
const variantSchema = z.object({
  flavor: z.string().min(1), nicotineStrength: z.string().default('0mg'),
  bottleSize: z.string().default('10ml'), priceOverride: z.coerce.number().nullable().optional(),
  stockQuantity: z.coerce.number().int().nonnegative().default(0),
  lowStockThreshold: z.coerce.number().int().nonnegative().default(5),
});

export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await db.select().from(products).orderBy(products.brand, products.name);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const a = await requireOwner();
  if (!a) return NextResponse.json({ error: 'Forbidden — only the owner can create products' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const pp = productSchema.safeParse(body);
  if (!pp.success) return NextResponse.json({ error: 'Bad product', issues: pp.error.flatten() }, { status: 400 });
  if (pp.data.categoryId != null) {
    const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, pp.data.categoryId)).limit(1);
    if (!cat) return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
  }
  const variants = Array.isArray(body.variants) ? body.variants : [];
  const [p] = await db.insert(products).values({
    ...pp.data, basePrice: pp.data.basePrice.toFixed(2),
  }).returning();
  const toInsert = [];
  for (const [i, v] of variants.entries()) {
    const vp = variantSchema.safeParse(v);
    if (!vp.success) continue;
    const sku = `${pp.data.brand.substring(0, 3).toUpperCase()}-${pp.data.name.substring(0, 3).toUpperCase()}-${(i + 1).toString().padStart(3, '0')}`;
    toInsert.push({
      productId: p.id, sku, flavor: vp.data.flavor, nicotineStrength: vp.data.nicotineStrength,
      bottleSize: vp.data.bottleSize,
      priceOverride: vp.data.priceOverride != null ? vp.data.priceOverride.toFixed(2) : null,
      stockQuantity: vp.data.stockQuantity, lowStockThreshold: vp.data.lowStockThreshold, isActive: true,
    });
  }
  if (toInsert.length) await db.insert(productVariants).values(toInsert);
  return NextResponse.json(p);
}
