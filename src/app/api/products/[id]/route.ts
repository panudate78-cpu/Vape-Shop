import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, productVariants, categories } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

async function loadProduct(id: number) {
  const [p] = await db
    .select({
      id: products.id, name: products.name, brand: products.brand, description: products.description,
      basePrice: products.basePrice, vgPgRatio: products.vgPgRatio, flavorProfile: products.flavorProfile,
      images: products.images, tags: products.tags, isActive: products.isActive,
      categorySlug: categories.slug, categoryName: categories.name, categoryId: categories.id,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);
  return p;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const p = await loadProduct(id);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const vs = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(productVariants.flavor);
  return NextResponse.json({
    product: {
      id: String(p.id), name: p.name, brand: p.brand, description: p.description,
      basePrice: Number(p.basePrice).toFixed(2), vgPgRatio: p.vgPgRatio,
      flavorProfile: p.flavorProfile,
      images: (p.images as string[] | null) || [],
      tags: (p.tags as string[] | null) || [],
      isActive: p.isActive,
      categoryId: p.categoryId != null ? String(p.categoryId) : null,
      categorySlug: p.categorySlug, categoryName: p.categoryName,
    },
    variants: vs.map((v) => ({
      id: String(v.id), sku: v.sku, flavor: v.flavor, nicotineStrength: v.nicotineStrength,
      bottleSize: v.bottleSize, color: v.color,
      price: Number(v.priceOverride ?? p.basePrice),
      priceOverride: v.priceOverride != null ? Number(v.priceOverride).toFixed(2) : null,
      stockQuantity: v.stockQuantity, lowStockThreshold: v.lowStockThreshold,
      isActive: v.isActive,
    })),
  });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { requireAdmin } = await import('@/lib/session');
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden — sign in as admin' }, { status: 403 });
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const existing = await loadProduct(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: Record<string, any> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.brand !== undefined) patch.brand = body.brand;
  if (body.description !== undefined) patch.description = body.description;
  if (body.basePrice !== undefined) patch.basePrice = Number(body.basePrice).toFixed(2);
  if (body.vgPgRatio !== undefined) patch.vgPgRatio = body.vgPgRatio;
  if (body.flavorProfile !== undefined) patch.flavorProfile = body.flavorProfile;
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags : [];
  if (body.images !== undefined) patch.images = Array.isArray(body.images) ? body.images : [];
  if (body.isActive !== undefined) patch.isActive = !!body.isActive;
  if (body.categoryId !== undefined) patch.categoryId = body.categoryId ? Number(body.categoryId) : null;

  if (Object.keys(patch).length) {
    await db.update(products).set(patch).where(eq(products.id, id));
  }

  // Upsert variants if provided
  const variants = Array.isArray(body.variants) ? body.variants : [];
  for (const v of variants) {
    if (v._delete && v.id) {
      await db.update(productVariants).set({ isActive: false }).where(eq(productVariants.id, Number(v.id)));
      continue;
    }
    const data: Record<string, any> = {
      flavor: v.flavor ?? '',
      nicotineStrength: v.nicotineStrength ?? '0mg',
      bottleSize: v.bottleSize ?? '10ml',
      color: v.color ?? null,
      priceOverride: v.priceOverride != null && v.priceOverride !== '' ? Number(v.priceOverride).toFixed(2) : null,
      stockQuantity: Number(v.stockQuantity ?? 0),
      lowStockThreshold: Number(v.lowStockThreshold ?? 5),
      isActive: v.isActive ?? true,
    };
    if (v.id) {
      await db.update(productVariants).set(data).where(eq(productVariants.id, Number(v.id)));
    } else {
      await db.insert(productVariants).values({
        productId: id,
        sku: v.sku || `SKU-${Date.now().toString(36).toUpperCase()}`,
        ...data,
      });
    }
  }

  const updated = await loadProduct(id);
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { requireAdmin } = await import('@/lib/session');
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden — sign in as admin' }, { status: 403 });
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const existing = await loadProduct(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check whether any order lines reference this product's variants — if there's
  // sales history we soft-delete (deactivate) so past orders/QuickBooks exports
  // still show the product name. If there's zero history, hard-delete so the
  // product is fully removed from the catalogue.
  const { orderItems } = await import('@/db/schema');
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(orderItems)
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(eq(productVariants.productId, id));

  if (count > 0) {
    // Soft delete: deactivate product + all its variants (disappears from shop)
    await db.update(products).set({ isActive: false }).where(eq(products.id, id));
    await db.update(productVariants).set({ isActive: false }).where(eq(productVariants.productId, id));
    return NextResponse.json({ ok: true, softDeleted: true, orderCount: count });
  }

  // Hard delete — cascade takes care of variants
  await db.delete(products).where(eq(products.id, id));
  return NextResponse.json({ ok: true, softDeleted: false });
}
