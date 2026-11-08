import { NextResponse } from "next/server";
import { db } from "@/db";
import { productVariants, products, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
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
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().trim());
  return lines.slice(1).filter(Boolean).map((l) => {
    const cells = splitLine(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
}

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const text = await req.text();
    const rows = parseCsv(text);
    if (!rows.length) return NextResponse.json({ error: "No rows found. Expected header: product_name,brand,sku,flavor,nicotine_strength,bottle_size,color,price,stock,..." }, { status: 400 });
    let updated = 0, created = 0;
    for (const r of rows) {
      const sku = (r.sku || "").trim();
      const stock = parseInt(r.stock || "0", 10) || 0;
      const price = r.price || null;
      if (sku) {
        const existing = await db.select().from(productVariants).where(eq(productVariants.sku, sku)).limit(1);
        if (existing.length) {
          await db.update(productVariants).set({
            stockQuantity: stock,
            ...(price ? { priceOverride: String(price) } : {}),
            ...(r.flavor ? { flavor: r.flavor } : {}),
            ...(r.nicotine_strength ? { nicotineStrength: r.nicotine_strength } : {}),
            ...(r.bottle_size ? { bottleSize: r.bottle_size } : {}),
            ...(r.color ? { color: r.color } : {}),
          }).where(eq(productVariants.sku, sku));
          updated++;
          continue;
        }
      }
      // create new product + variant if product_name present
      if (r.product_name) {
        const existingProd = r.product_name
          ? await db.select().from(products).where(eq(products.name, r.product_name)).limit(1)
          : [];
        let productId = existingProd[0]?.id;
        if (!productId) {
          const cats = await db.select().from(categories).limit(1);
          const ins = await db.insert(products).values({
            categoryId: cats[0]?.id || null,
            name: r.product_name,
            brand: r.brand || "House Brand",
            description: "",
            basePrice: String(price || "9.99"),
            images: [],
            tags: [],
            isActive: true,
          }).returning();
          productId = ins[0].id;
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
          lowStockThreshold: parseInt(r.low_stock_threshold || "10", 10) || 10,
          isActive: r.is_active ? r.is_active.toLowerCase() !== "false" : true,
        });
        created++;
      }
    }
    return NextResponse.json({ ok: true, updated, created, total: rows.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
