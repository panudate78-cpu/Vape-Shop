import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, productVariants, categories } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [p] = await db.select({
    id: products.id, name: products.name, brand: products.brand, description: products.description,
    basePrice: products.basePrice, vgPgRatio: products.vgPgRatio, flavorProfile: products.flavorProfile,
    images: products.images, tags: products.tags, categorySlug: categories.slug, categoryName: categories.name,
  })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.id, id), eq(products.isActive, true)))
    .limit(1);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const vs = await db.select().from(productVariants).where(and(eq(productVariants.productId, id), eq(productVariants.isActive, true))).orderBy(productVariants.flavor);
  return NextResponse.json({
    product: {
      id: String(p.id), name: p.name, brand: p.brand, description: p.description,
      basePrice: Number(p.basePrice).toFixed(2), vgPgRatio: p.vgPgRatio, flavorProfile: p.flavorProfile,
      images: (p.images as string[] | null) || [], tags: (p.tags as string[] | null) || [],
      categorySlug: p.categorySlug, categoryName: p.categoryName,
    },
    variants: vs.map((v) => ({
      id: String(v.id), sku: v.sku, flavor: v.flavor, nicotineStrength: v.nicotineStrength,
      bottleSize: v.bottleSize, color: v.color,
      price: Number(v.priceOverride ?? p.basePrice),
      stockQuantity: v.stockQuantity,
    })),
  });
}
