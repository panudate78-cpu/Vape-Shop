import { NextResponse } from "next/server";
import { db } from "@/db";
import { productVariants, products, categories } from "@/db/schema";
import { eq, ilike } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length < 2) return [];
  const splitLine = (l: string) => {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') {
        if (inQ && l[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) { out.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    out.push(cur.trim());
    return out.map((s) => s.replace(/^"|"$/g, ""));
  };
  let headerIdx = 0;
  while (headerIdx < lines.length && (lines[headerIdx].trim().startsWith('#') || !lines[headerIdx].trim())) headerIdx++;
  if (headerIdx >= lines.length) return [];
  const headers = splitLine(lines[headerIdx]).map((h) => h.toLowerCase().trim());
  const rows: Record<string, string>[] = [];
  for (const raw of lines.slice(headerIdx + 1)) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const cells = splitLine(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    rows.push(obj);
  }
  return rows;
}

async function resolveCategory(name: string | undefined): Promise<number | null> {
  if (!name?.trim()) return null;
  const trimmed = name.trim();
  const existing = await db.select({ id: categories.id }).from(categories).where(ilike(categories.name, trimmed)).limit(1);
  if (existing[0]) return existing[0].id;
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const [cat] = await db.insert(categories).values({ name: trimmed, slug, description: '' }).returning({ id: categories.id });
  return cat.id;
}

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const text = await req.text();
    const rows = parseCsv(text);
    if (!rows.length) return NextResponse.json({ error: "No rows found. Expected header: sku, product_name, brand, category, flavor, nicotine_strength, bottle_size, color, stock, price, ..." }, { status: 400 });
    let updated = 0, created = 0, createdCategories = 0;
    for (const r of rows) {
      const sku = (r.sku || "").trim();
      const stock = parseInt(r.stock || "0", 10) || 0;
      const price = (r.price || "").trim() || null;
      const threshold = parseInt(r.low_stock_threshold || "10", 10) || 10;
      const isActive = r.is_active ? r.is_active.toLowerCase() !== "false" : true;

      // UPDATE existing variant by SKU
      if (sku) {
        const existing = await db.select().from(productVariants).where(eq(productVariants.sku, sku)).limit(1);
        if (existing.length) {
          await db.update(productVariants).set({
            stockQuantity: stock,
            ...(price ? { priceOverride: String(price) } : {}),
            ...(r.flavor !== undefined ? { flavor: r.flavor || null } : {}),
            ...(r.nicotine_strength !== undefined ? { nicotineStrength: r.nicotine_strength || null } : {}),
            ...(r.bottle_size !== undefined ? { bottleSize: r.bottle_size || null } : {}),
            ...(r.color !== undefined ? { color: r.color || null } : {}),
            lowStockThreshold: threshold,
            isActive,
          }).where(eq(productVariants.sku, sku));
          updated++;
          continue;
        }
      }

      // CREATE new product + variant
      const productName = (r.product_name || "").trim();
      if (!productName) continue;
      let existingProd = await db.select({ id: products.id, categoryId: products.categoryId }).from(products).where(ilike(products.name, productName)).limit(1);
      let productId = existingProd[0]?.id;
      if (!productId) {
        const catId = await resolveCategory(r.category);
        if (catId) createdCategories++;
        const ins = await db.insert(products).values({
          categoryId: catId,
          name: productName,
          brand: (r.brand || "House Brand").trim() || "House Brand",
          description: "",
          basePrice: String(price || "9.99"),
          images: [],
          tags: [],
          isActive: true,
        }).returning({ id: products.id });
        productId = ins[0].id;
      } else if (r.category && !existingProd[0].categoryId) {
        // If product exists but has no category, assign one.
        const catId = await resolveCategory(r.category);
        if (catId) { await db.update(products).set({ categoryId: catId }).where(eq(products.id, productId)); createdCategories++; }
      }
      await db.insert(productVariants).values({
        productId,
        sku: sku || `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        flavor: r.flavor || null,
        nicotineStrength: r.nicotine_strength || null,
        bottleSize: r.bottle_size || null,
        color: r.color || null,
        priceOverride: price ? String(price) : null,
        stockQuantity: stock,
        lowStockThreshold: threshold,
        isActive,
      });
      created++;
    }
    return NextResponse.json({ ok: true, updated, created, createdCategories, total: rows.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Import failed: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
