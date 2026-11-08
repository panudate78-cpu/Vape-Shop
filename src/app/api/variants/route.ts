import { NextResponse } from "next/server";
import { db } from "@/db";
import { productVariants, products } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET all variants (admin inventory) or low-stock list
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lowOnly = url.searchParams.get("lowOnly") === "1";
  const s = await getSession();
  // public can read stock availability, but low-stock filter requires admin
  const vars = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      sku: productVariants.sku,
      flavor: productVariants.flavor,
      nicotineStrength: productVariants.nicotineStrength,
      bottleSize: productVariants.bottleSize,
      color: productVariants.color,
      priceOverride: productVariants.priceOverride,
      stockQuantity: productVariants.stockQuantity,
      lowStockThreshold: productVariants.lowStockThreshold,
      isActive: productVariants.isActive,
      productName: products.name,
      brand: products.brand,
      basePrice: products.basePrice,
    })
    .from(productVariants)
    .leftJoin(products, eq(productVariants.productId, products.id));

  let out = vars;
  if (lowOnly) {
    if (!s || s.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    out = vars.filter((v) => (v.stockQuantity ?? 0) <= (v.lowStockThreshold ?? 10));
  }
  return NextResponse.json({ variants: out });
}

// PATCH single variant stock / price (admin quick-edit)
export async function PATCH(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const { id, stockQuantity, priceOverride, lowStockThreshold, isActive, sku } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.update(productVariants).set({
    ...(stockQuantity != null ? { stockQuantity: parseInt(stockQuantity, 10) } : {}),
    ...(priceOverride !== undefined ? { priceOverride: priceOverride === "" || priceOverride == null ? null : String(priceOverride) } : {}),
    ...(lowStockThreshold != null ? { lowStockThreshold: parseInt(lowStockThreshold, 10) } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(sku ? { sku } : {}),
  }).where(eq(productVariants.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.execute(sql`DELETE FROM product_variants WHERE id = ${id}`);
  return NextResponse.json({ ok: true });
}
