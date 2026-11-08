import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productVariants, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = rows[0];
  const vars = await db.select().from(productVariants).where(eq(productVariants.productId, id));
  let cat = null;
  if (p.categoryId) {
    const c = await db.select().from(categories).where(eq(categories.id, p.categoryId)).limit(1);
    cat = c[0] || null;
  }
  return NextResponse.json({ product: { ...p, variants: vars, category: cat } });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    const body = await req.json();
    const { variants, ...p } = body;
    await db.update(products).set({
      categoryId: p.categoryId || null,
      name: p.name,
      brand: p.brand,
      description: p.description,
      basePrice: p.basePrice != null ? String(p.basePrice) : undefined,
      vgPgRatio: p.vgPgRatio,
      flavorProfile: p.flavorProfile,
      images: p.images,
      tags: p.tags,
      isActive: p.isActive,
      updatedAt: new Date(),
    }).where(eq(products.id, id));
    if (Array.isArray(variants)) {
      for (const v of variants) {
        if (v.id) {
          await db.update(productVariants).set({
            sku: v.sku,
            flavor: v.flavor || null,
            nicotineStrength: v.nicotineStrength || null,
            bottleSize: v.bottleSize || null,
            color: v.color || null,
            priceOverride: v.priceOverride != null && v.priceOverride !== "" ? String(v.priceOverride) : null,
            stockQuantity: v.stockQuantity != null ? parseInt(v.stockQuantity, 10) : undefined,
            lowStockThreshold: v.lowStockThreshold != null ? parseInt(v.lowStockThreshold, 10) : undefined,
            isActive: v.isActive,
          }).where(eq(productVariants.id, v.id));
        } else {
          await db.insert(productVariants).values({
            productId: id,
            sku: v.sku || `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            flavor: v.flavor || null,
            nicotineStrength: v.nicotineStrength || null,
            bottleSize: v.bottleSize || null,
            color: v.color || null,
            priceOverride: v.priceOverride ? String(v.priceOverride) : null,
            stockQuantity: parseInt(v.stockQuantity ?? 0, 10) || 0,
            lowStockThreshold: parseInt(v.lowStockThreshold ?? 10, 10) || 10,
            isActive: v.isActive ?? true,
          });
        }
        if (v._delete && v.id) {
          const { sql } = await import("drizzle-orm");
          await db.execute(sql`DELETE FROM product_variants WHERE id = ${v.id}`);
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`DELETE FROM product_variants WHERE product_id = ${id}`);
  await db.execute(sql`DELETE FROM products WHERE id = ${id}`);
  return NextResponse.json({ ok: true });
}
