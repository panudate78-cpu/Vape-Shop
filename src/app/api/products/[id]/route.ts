import { audit } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, productVariants, categories } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
function scrubDesc(d: unknown): string {
  return String(d || '').replace(HEX_COLOR_RE, '').replace(/\s{2,}/g, ' ').trim();
}

let ensuredCols = false;
async function ensureColumns() {
  if (ensuredCols) return;
  const tryAdd = async (stmt: any) => { try { await db.execute(stmt); } catch (e: any) { if (!/already exists|duplicate column/i.test(e.message || '')) console.warn('[products] col add:', e.message); } };
  await tryAdd(sql`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode TEXT`);
  ensuredCols = true;
}

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
  await ensureColumns();
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const p = await loadProduct(id);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { requireAdmin } = await import('@/lib/session');
  const staff = await requireAdmin();
  // Shoppers never see archived products or archived variants. Staff see both, so they can restore them.
  if (!p.isActive && !staff) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Load ALL variants (including inactive/archived) so the editor can show
  // archived rows dimmed with a reactivate toggle.
  const vs = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(productVariants.flavor);
  const base = Number(p.basePrice);
  const visible = staff ? vs : vs.filter((v) => v.isActive);
  return NextResponse.json({
    product: {
      id: String(p.id), name: p.name, brand: p.brand, description: scrubDesc(p.description),
      basePrice: Number(base).toFixed(2), vgPgRatio: p.vgPgRatio,
      flavorProfile: p.flavorProfile,
      images: (p.images as string[] | null) || [],
      tags: (p.tags as string[] | null) || [],
      isActive: p.isActive,
      categoryId: p.categoryId != null ? String(p.categoryId) : null,
      categorySlug: p.categorySlug, categoryName: p.categoryName,
    },
    variants: visible.map((v) => {
      const override = v.priceOverride != null ? Number(v.priceOverride) : NaN;
      const unitPrice = !isNaN(override) && override > 0 ? override : base;
      return {
        id: String(v.id), sku: v.sku, barcode: staff ? (v as any).barcode || null : undefined, flavor: v.flavor, nicotineStrength: v.nicotineStrength,
        bottleSize: v.bottleSize, color: v.color,
        basePrice: Number(base.toFixed(2)),
        priceOverride: !isNaN(override) && override > 0 ? Number(override.toFixed(2)) : null,
        price: Number(unitPrice.toFixed(2)),
        unitPrice: Number(unitPrice.toFixed(2)),
        stockQuantity: v.stockQuantity, lowStockThreshold: v.lowStockThreshold,
        isActive: v.isActive,
      };
    }),
  });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { requireAdmin } = await import('@/lib/session');
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden — sign in as admin' }, { status: 403 });
  await ensureColumns();
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const existing = await loadProduct(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body.name !== undefined && !String(body.name).trim()) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }
  // Price changes are owner-only. Compared against stored values, so saving an unchanged product is fine for managers.
  const priceRows: any[] = await db.execute(sql`SELECT id, price_override FROM product_variants WHERE product_id = ${id}`);
  const priceChanged =
    (body.basePrice !== undefined && Number(body.basePrice).toFixed(2) !== Number(existing.basePrice).toFixed(2)) ||
    (Array.isArray(body.variants) && body.variants.some((v: any) => {
      if (v.priceOverride === undefined) return false;
      const cur = priceRows.find((r) => Number(r.id) === Number(v.id));
      const next = v.priceOverride == null || v.priceOverride === '' ? null : Number(v.priceOverride);
      const prev = cur?.price_override == null ? null : Number(cur.price_override);
      return next !== prev;
    }));
  if (priceChanged && admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the owner can change prices.', code: 'OWNER_ONLY' }, { status: 403 });
  }
  if (body.basePrice !== undefined) {
    const bp = Number(body.basePrice);
    if (isNaN(bp) || bp <= 0) return NextResponse.json({ error: 'Base price must be greater than £0.' }, { status: 400 });
  }

  if (priceChanged) {
    await audit(admin, 'price.change', 'product', id, {
      from: Number(existing.basePrice), to: body.basePrice !== undefined ? Number(body.basePrice) : undefined,
      variantOverrides: Array.isArray(body.variants) ? body.variants.filter((v: any) => v.priceOverride !== undefined).map((v: any) => ({ id: v.id, priceOverride: v.priceOverride })) : undefined,
    });
  }
  const patch: Record<string, any> = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.brand !== undefined) patch.brand = body.brand;
  if (body.description !== undefined) patch.description = scrubDesc(body.description);
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

  const variants = Array.isArray(body.variants) ? body.variants : [];

  // Barcodes must be unique across all variants (scanner lookup depends on it).
  const incomingCodes: { code: string; id: number | null }[] = variants
    .filter((v: any) => !v._delete && typeof v.barcode === 'string' && v.barcode.trim())
    .map((v: any) => ({ code: v.barcode.trim() as string, id: v.id ? Number(v.id) : null }));
  const seen = new Set<string>();
  for (const c of incomingCodes) {
    if (seen.has(c.code)) return NextResponse.json({ error: `Barcode ${c.code} is used twice in this product.` }, { status: 409 });
    seen.add(c.code);
  }
  if (incomingCodes.length) {
    const clash = await db.execute(sql`SELECT id, barcode, product_id FROM product_variants WHERE barcode = ANY(${incomingCodes.map((c) => c.code)})`);
    const rows = (clash as any).rows ?? clash;
    const conflict = (rows as any[]).find((r) => !incomingCodes.some((c) => c.code === r.barcode && c.id === Number(r.id)));
    if (conflict) return NextResponse.json({ error: `Barcode ${conflict.barcode} already belongs to another variant (product #${conflict.product_id}).` }, { status: 409 });
  }

  for (const v of variants) {
    // Drop brand-new rows that were immediately marked _delete — they never
    // existed on the server so there's nothing to deactivate.
    if (v._delete && v.id) {
      await db.update(productVariants).set({ isActive: false }).where(eq(productVariants.id, Number(v.id)));
      continue;
    }
    if (v._delete && !v.id) continue;
    const data: Record<string, any> = {
      flavor: v.flavor ?? '',
      nicotineStrength: v.nicotineStrength ?? '0mg',
      bottleSize: v.bottleSize ?? '10ml',
      color: v.color ?? null,
      barcode: typeof v.barcode === 'string' && v.barcode.trim() ? v.barcode.trim() : null,
      priceOverride: v.priceOverride != null && v.priceOverride !== '' && Number(v.priceOverride) > 0 ? Number(v.priceOverride).toFixed(2) : null,
      stockQuantity: Number(v.stockQuantity ?? 0),
      lowStockThreshold: Number(v.lowStockThreshold ?? 5),
      isActive: v.isActive ?? true,
    };
    if (v.id) {
      await db.update(productVariants).set(data).where(eq(productVariants.id, Number(v.id)));
    } else {
      await db.insert(productVariants).values({
        productId: id,
        sku: v.sku || `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        ...data,
      });
    }
  }

  const updated = await loadProduct(id);
  return NextResponse.json({ ok: true, name: updated.name });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { requireOwner } = await import('@/lib/session');
  const admin = await requireOwner();
  if (!admin) return NextResponse.json({ error: 'Forbidden — only the owner can delete products' }, { status: 403 });
  await audit(admin, 'product.delete', 'product', params.id, {});
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const existing = await loadProduct(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The UI now always soft-archives via POST /archive. This endpoint is kept
  // for belt-and-braces: if there's sales history we soft-delete (preserve
  // accounting); otherwise we hard-delete.
  const { orderItems } = await import('@/db/schema');
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(orderItems)
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(eq(productVariants.productId, id));

  if (count > 0) {
    await db.update(products).set({ isActive: false }).where(eq(products.id, id));
    await db.update(productVariants).set({ isActive: false }).where(eq(productVariants.productId, id));
    return NextResponse.json({ ok: true, softDeleted: true, orderCount: count });
  }
  await db.delete(products).where(eq(products.id, id));
  return NextResponse.json({ ok: true, softDeleted: false });
}
