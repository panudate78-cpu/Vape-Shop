import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, productVariants, categories } from '@/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') || undefined;
  const q = searchParams.get('q') || undefined;
  const brand = searchParams.get('brand') || undefined;
  const inStock = searchParams.get('inStock') === '1';
  const maxPriceStr = searchParams.get('maxPrice');
  const sort = searchParams.get('sort') || 'name';

  // Pull all products + categories + active variants in a single shape, then aggregate in JS.
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      description: products.description,
      basePrice: products.basePrice,
      vgPgRatio: products.vgPgRatio,
      flavorProfile: products.flavorProfile,
      images: products.images,
      tags: products.tags,
      isActive: products.isActive,
      categoryId: categories.id,
      categorySlug: categories.slug,
      categoryName: categories.name,
      v_id: productVariants.id,
      v_sku: productVariants.sku,
      v_flavor: productVariants.flavor,
      v_nicotineStrength: productVariants.nicotineStrength,
      v_bottleSize: productVariants.bottleSize,
      v_color: productVariants.color,
      v_priceOverride: productVariants.priceOverride,
      v_stockQuantity: productVariants.stockQuantity,
      v_isActive: productVariants.isActive,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .where(
      and(
        eq(products.isActive, true),
        category ? eq(categories.slug, category) : undefined,
        q ? sql`${products.name} ilike ${'%' + q + '%'}` : undefined,
        brand ? eq(products.brand, brand) : undefined,
      )
    );

  const byId = new Map<number, any>();
  const brandSet = new Set<string>();

  for (const r of rows) {
    if (!r.id) continue;
    let p = byId.get(r.id);
    if (!p) {
      p = {
        id: String(r.id),
        name: r.name,
        brand: r.brand,
        description: r.description,
        basePrice: Number(r.basePrice ?? 0).toFixed(2),
        vgPgRatio: r.vgPgRatio,
        flavorProfile: r.flavorProfile,
        images: (r.images as string[] | null) || [],
        tags: (r.tags as string[] | null) || [],
        categoryId: r.categoryId != null ? String(r.categoryId) : null,
        categorySlug: r.categorySlug ?? null,
        categoryName: r.categoryName ?? null,
        variants: [] as any[],
        brandSet: brandSet,
      };
      byId.set(r.id, p);
    }
    if (r.brand) brandSet.add(r.brand);
    if (r.v_id != null && r.v_isActive) {
      const price = r.v_priceOverride != null ? Number(r.v_priceOverride) : Number(r.basePrice ?? 0);
      p.variants.push({
        id: String(r.v_id),
        sku: r.v_sku,
        flavor: r.v_flavor ?? '',
        nicotineStrength: r.v_nicotineStrength ?? '0mg',
        bottleSize: r.v_bottleSize ?? '10ml',
        color: r.v_color ?? null,
        priceOverride: price.toFixed(2),
        stockQuantity: r.v_stockQuantity ?? 0,
      });
    }
  }

  let list = Array.from(byId.values()).map((p) => {
    const prices = p.variants.length ? p.variants.map((v: any) => Number(v.priceOverride)) : [Number(p.basePrice)];
    const totalStock = p.variants.reduce((s: number, v: any) => s + (v.stockQuantity ?? 0), 0);
    return {
      ...p,
      minPrice: Math.min(...prices),
      totalStock,
      inStock: totalStock > 0,
    };
  });

  if (maxPriceStr) { const max = parseFloat(maxPriceStr); if (!isNaN(max)) list = list.filter((p) => p.minPrice <= max); }
  if (inStock) list = list.filter((p) => p.totalStock > 0);
  if (sort === 'price_asc') list = [...list].sort((a, b) => a.minPrice - b.minPrice);
  else if (sort === 'price_desc') list = [...list].sort((a, b) => b.minPrice - a.minPrice);
  else list = [...list].sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    products: list.map(({ brandSet: _b, ...rest }) => rest),
    brands: Array.from(brandSet).sort(),
  });
}
