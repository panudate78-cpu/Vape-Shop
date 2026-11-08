import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productVariants, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const category = url.searchParams.get("category") || "";
  const brand = url.searchParams.get("brand") || "";
  const flavorProfile = url.searchParams.get("flavorProfile") || "";
  const nicotine = url.searchParams.get("nicotine") || "";
  const bottleSize = url.searchParams.get("bottleSize") || "";
  const vgpg = url.searchParams.get("vgpg") || "";
  const minPrice = url.searchParams.get("minPrice");
  const maxPrice = url.searchParams.get("maxPrice");
  const includeInactive = url.searchParams.get("includeInactive") === "1";

  let rows = await db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      name: products.name,
      brand: products.brand,
      description: products.description,
      basePrice: products.basePrice,
      vgPgRatio: products.vgPgRatio,
      flavorProfile: products.flavorProfile,
      images: products.images,
      tags: products.tags,
      isActive: products.isActive,
      createdAt: products.createdAt,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id));

  // in-memory filtering for flexibility with variant attributes
  const variantRows = await db.select().from(productVariants);

  const byProduct: Record<string, typeof variantRows> = {};
  for (const v of variantRows) {
    if (!byProduct[v.productId]) byProduct[v.productId] = [];
    byProduct[v.productId].push(v);
  }

  let filtered = rows.filter((p) => {
    if (!includeInactive && !p.isActive) return false;
    if (q && !(`${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (category && p.categorySlug !== category) return false;
    if (brand && p.brand !== brand) return false;
    if (flavorProfile && p.flavorProfile !== flavorProfile) return false;
    if (vgpg && p.vgPgRatio !== vgpg) return false;
    const vars = byProduct[p.id] || [];
    if (nicotine && !vars.some((v) => v.nicotineStrength === nicotine)) return false;
    if (bottleSize && !vars.some((v) => v.bottleSize === bottleSize)) return false;
    if (minPrice || maxPrice) {
      const prices = vars.map((v) => parseFloat(v.priceOverride ?? p.basePrice ?? "0"));
      const lo = prices.length ? Math.min(...prices) : parseFloat(p.basePrice ?? "0");
      if (minPrice && lo < parseFloat(minPrice)) {
        // allow if any variant above min
        if (!prices.some((x) => x >= parseFloat(minPrice))) return false;
      }
      if (maxPrice && lo > parseFloat(maxPrice)) {
        if (!prices.some((x) => x <= parseFloat(maxPrice))) return false;
      }
    }
    return true;
  });

  const withVariants = filtered.map((p) => ({
    ...p,
    variants: (byProduct[p.id] || []).filter((v) => includeInactive || v.isActive),
    minPrice: (() => {
      const vars = byProduct[p.id] || [];
      if (!vars.length) return parseFloat(p.basePrice ?? "0");
      return Math.min(...vars.map((v) => parseFloat(v.priceOverride ?? p.basePrice ?? "0")));
    })(),
    totalStock: (byProduct[p.id] || []).reduce((s, v) => s + (v.stockQuantity ?? 0), 0),
  }));

  const brands = [...new Set(rows.map((r) => r.brand).filter(Boolean))];
  return NextResponse.json({ products: withVariants, brands });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await req.json();
    const { variants, ...p } = body;
    if (!p.name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const inserted = await db.insert(products).values({
      categoryId: p.categoryId || null,
      name: p.name,
      brand: p.brand || "House Brand",
      description: p.description || "",
      basePrice: String(p.basePrice ?? 0),
      vgPgRatio: p.vgPgRatio || "50/50",
      flavorProfile: p.flavorProfile || null,
      images: p.images || [],
      tags: p.tags || [],
      isActive: p.isActive ?? true,
    }).returning();
    const product = inserted[0];
    if (Array.isArray(variants)) {
      for (const v of variants) {
        await db.insert(productVariants).values({
          productId: product.id,
          sku: v.sku || `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          flavor: v.flavor || null,
          nicotineStrength: v.nicotineStrength || null,
          bottleSize: v.bottleSize || null,
          color: v.color || null,
          priceOverride: v.priceOverride != null && v.priceOverride !== "" ? String(v.priceOverride) : null,
          stockQuantity: parseInt(v.stockQuantity ?? 0, 10) || 0,
          lowStockThreshold: parseInt(v.lowStockThreshold ?? 10, 10) || 10,
          isActive: v.isActive ?? true,
        });
      }
    }
    return NextResponse.json({ product });
  } catch (e: unknown) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
