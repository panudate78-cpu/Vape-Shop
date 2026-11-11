import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, productVariants, categories } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isAllowedImage, freeSku, duplicateResponse } from '@/lib/product-save';

export const dynamic = 'force-dynamic';

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
function scrubDesc(d: unknown): string {
  // Defence-in-depth: strip stray hex colour codes that slipped past the editor
  // (e.g. pasted rich text) so they never show to customers.
  return String(d || "").replace(HEX_COLOR_RE, "").replace(/\s{2,}/g, " ").trim();
}

// Shoppers' product list. Search matches every word against name, brand, flavour, tags,
// category, description, SKU, strength and size. Filters are applied on the server so the
// counts and the facet lists always agree with the results.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') || undefined;
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const brand = searchParams.get('brand') || undefined;
  const strength = (searchParams.get('strength') || '').trim().toLowerCase();
  const flavour = (searchParams.get('flavour') || '').trim().toLowerCase();
  const inStock = searchParams.get('inStock') === '1';
  const maxPriceStr = searchParams.get('maxPrice');
  const sort = searchParams.get('sort') || 'name';

  const rows = await db
    .select({
      id: products.id, name: products.name, brand: products.brand, description: products.description,
      basePrice: products.basePrice, vgPgRatio: products.vgPgRatio, flavorProfile: products.flavorProfile,
      images: products.images, tags: products.tags, isActive: products.isActive,
      categoryId: categories.id, categorySlug: categories.slug, categoryName: categories.name,
      v_id: productVariants.id, v_sku: productVariants.sku, v_flavor: productVariants.flavor,
      v_nicotineStrength: productVariants.nicotineStrength, v_bottleSize: productVariants.bottleSize,
      v_color: productVariants.color, v_priceOverride: productVariants.priceOverride,
      v_stockQuantity: productVariants.stockQuantity, v_reserved: productVariants.reservedQuantity, v_isActive: productVariants.isActive,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .where(eq(products.isActive, true));

  const byId = new Map<number, any>();
  const brandSet = new Set<string>();
  const strengthSet = new Set<string>();
  const flavourSet = new Set<string>();
  for (const r of rows) {
    if (!r.id) continue;
    let p = byId.get(r.id);
    if (!p) {
      p = {
        id: String(r.id),
        name: r.name, brand: r.brand, description: scrubDesc(r.description),
        basePrice: Number(r.basePrice ?? 0),
        vgPgRatio: r.vgPgRatio, flavorProfile: cleanProfile(r.flavorProfile),
        images: (r.images as string[] | null) || [],
        tags: (r.tags as string[] | null) || [],
        categoryId: r.categoryId != null ? String(r.categoryId) : null,
        categorySlug: r.categorySlug ?? null,
        categoryName: r.categoryName ?? null,
        variants: [] as any[],
      };
      byId.set(r.id, p);
    }
    if (r.brand) brandSet.add(r.brand);
    if (r.v_id != null && r.v_isActive) {
      const override = r.v_priceOverride != null ? Number(r.v_priceOverride) : NaN;
      const unitPrice = !isNaN(override) && override > 0 ? override : Number(r.basePrice ?? 0);
      const flavor = cleanText(r.v_flavor);
      const nicotineStrength = cleanText(r.v_nicotineStrength) || '0mg';
      if (nicotineStrength) strengthSet.add(nicotineStrength);
      if (flavor) flavourSet.add(flavor);
      p.variants.push({
        id: String(r.v_id), sku: r.v_sku,
        flavor, nicotineStrength,
        bottleSize: cleanText(r.v_bottleSize) || '10ml', color: r.v_color ?? null,
        priceOverride: !isNaN(override) && override > 0 ? Number(override.toFixed(2)) : null,
        price: Number(unitPrice.toFixed(2)),
        unitPrice: Number(unitPrice.toFixed(2)),
        // Available to buy now: on hand minus units held for other checkouts.
        stockQuantity: Math.max(0, (r.v_stockQuantity ?? 0) - (r.v_reserved ?? 0)),
      });
    }
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  const matchesSearch = (p: any) => {
    if (!tokens.length) return true;
    const hay = [
      p.name, p.brand, p.flavorProfile, p.categoryName, p.description, p.vgPgRatio,
      ...(p.tags || []),
      ...p.variants.flatMap((v: any) => [v.flavor, v.sku, v.nicotineStrength, v.bottleSize]),
    ].filter(Boolean).join(' ').toLowerCase();
    // Every word must appear somewhere, so "mango 10mg" finds mango liquids at 10mg.
    return tokens.every((t) => hay.includes(t));
  };
  const hasVariant = (p: any, pred: (v: any) => boolean) => p.variants.some(pred);

  let list = Array.from(byId.values()).map((p) => {
    const prices = p.variants.length ? p.variants.map((v: any) => v.unitPrice) : [p.basePrice];
    const totalStock = p.variants.reduce((s: number, v: any) => s + (v.stockQuantity ?? 0), 0);
    const minPrice = Math.min(...prices);
    return {
      ...p,
      basePrice: Number(p.basePrice).toFixed(2),
      minPrice: Number(minPrice.toFixed(2)),
      totalStock, inStock: totalStock > 0,
    };
  });

  list = list.filter((p) =>
    (!category || p.categorySlug === category) &&
    (!brand || (p.brand || '').toLowerCase() === brand.toLowerCase()) &&
    matchesSearch(p) &&
    (!strength || hasVariant(p, (v) => v.nicotineStrength.toLowerCase() === strength)) &&
    (!flavour || hasVariant(p, (v) => v.flavor.toLowerCase() === flavour || (p.flavorProfile || '').toLowerCase() === flavour)) &&
    (!inStock || p.totalStock > 0)
  );
  if (maxPriceStr) {
    const max = parseFloat(maxPriceStr);
    if (!isNaN(max)) list = list.filter((p) => p.minPrice <= max);
  }
  if (sort === 'price_asc') list = [...list].sort((a, b) => a.minPrice - b.minPrice || a.name.localeCompare(b.name));
  else if (sort === 'price_desc') list = [...list].sort((a, b) => b.minPrice - a.minPrice || a.name.localeCompare(b.name));
  else list = [...list].sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    count: list.length,
    products: list,
    // Merge brands that differ only by case (e.g. "SMOK" and "Smok") so the facet lists each once.
    brands: Array.from(new Map(Array.from(brandSet).map((b) => [b.toLowerCase(), b])).values()).sort(),
    strengths: Array.from(strengthSet).sort(strengthSort),
    flavours: Array.from(flavourSet).sort(),
  });
}

// Stored placeholders ("—", "-") are not real values and must not reach shoppers.
function cleanText(v: unknown): string {
  const t = String(v ?? '').trim();
  return t === '—' || t === '-' || t === '–' ? '' : t;
}
function cleanProfile(v: unknown): string | null {
  const t = cleanText(v);
  return t || null;
}
// Sort nicotine strengths numerically (0mg, 3mg, 6mg, 12mg, 20mg).
function strengthSort(a: string, b: string) {
  return (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b);
}

// ---------- Create product (admin) ----------
const variantSchema = z.object({
  flavor: z.string().default(''),
  nicotineStrength: z.string().default('0mg'),
  bottleSize: z.string().default('10ml'),
  color: z.string().optional().nullable().default(null),
  priceOverride: z.coerce.number().nullable().optional(),
  stockQuantity: z.coerce.number().int().nonnegative().default(0),
  lowStockThreshold: z.coerce.number().int().nonnegative().default(5),
  isActive: z.boolean().default(true),
  sku: z.string().optional(),
  _delete: z.boolean().optional(),
  id: z.string().optional(),
});

const productSchema = z.object({
  name: z.string().min(1),
  brand: z.string().min(1),
  categoryId: z.union([z.coerce.number(), z.null()]).optional(),
  description: z.string().default(''),
  basePrice: z.coerce.number().positive('Base price must be greater than £0'),
  vgPgRatio: z.string().default('70/30'),
  flavorProfile: z.string().default(''),
  tags: z.array(z.string()).default([]),
  images: z.array(z.string().refine(isAllowedImage, 'Image must be an https:// link or an uploaded image')).default([]),
  isActive: z.boolean().default(true),
  variants: z.array(variantSchema).default([]),
});

const HEX_COLOR_RE_SAVE = /#[0-9a-fA-F]{3,8}\b/g;

export async function POST(req: Request) {
  const { requireOwner } = await import('@/lib/session');
  const admin = await requireOwner();
  if (!admin) return NextResponse.json({ error: 'Forbidden — only the owner can create products' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'Bad product' }, { status: 400 });
  }
  const data = parsed.data;

  const cleanDesc = String(data.description || '').replace(HEX_COLOR_RE_SAVE, '').replace(/\s{2,}/g, ' ').trim();

  try {
    // One transaction: a failed variant must not leave a product with no variants behind.
    const created = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(products)
        .values({
          name: data.name.trim(), brand: data.brand,
          categoryId: data.categoryId || null,
          description: cleanDesc,
          basePrice: data.basePrice.toFixed(2),
          vgPgRatio: data.vgPgRatio,
          flavorProfile: data.flavorProfile,
          tags: data.tags,
          images: data.images,
          isActive: data.isActive,
        })
        .returning();

      const reserved = new Set<string>();
      const toInsert = [];
      let i = 0;
      for (const v of data.variants.filter((v) => !v._delete)) {
        const base = v.sku?.trim() || `${data.brand.substring(0, 3).toUpperCase()}-${data.name.substring(0, 3).toUpperCase()}-${(i + 1).toString().padStart(3, '0')}`;
        // A typed-in SKU is kept as entered (a clash is reported); only generated SKUs are adjusted.
        const sku = v.sku?.trim() ? v.sku.trim() : await freeSku(tx, base, reserved);
        if (v.sku?.trim()) reserved.add(sku);
        toInsert.push({
          productId: p.id,
          sku,
          flavor: v.flavor,
          nicotineStrength: v.nicotineStrength,
          bottleSize: v.bottleSize,
          color: v.color,
          priceOverride: v.priceOverride != null && v.priceOverride > 0 ? Number(v.priceOverride).toFixed(2) : null,
          stockQuantity: v.stockQuantity,
          lowStockThreshold: v.lowStockThreshold,
          isActive: v.isActive,
        });
        i += 1;
      }
      if (toInsert.length) await tx.insert(productVariants).values(toInsert);
      return p;
    });
    return NextResponse.json(created);
  } catch (e: any) {
    const dup = duplicateResponse(e);
    if (dup) return dup;
    console.error('[products] create failed:', e);
    return NextResponse.json({ error: 'Could not create the product. Nothing was saved. Please try again.' }, { status: 500 });
  }
}
