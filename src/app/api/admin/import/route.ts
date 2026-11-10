import { NextResponse } from "next/server";
import { db } from "@/db";
import { productVariants, products, categories } from "@/db/schema";
import { eq, ilike, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";

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
  const headers = splitLine(lines[headerIdx]).map((h) => h.toLowerCase().trim().replace(/\s+/g,'_'));
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

function parseImageList(s: string | undefined): string[] {
  if (!s?.trim()) return [];
  const t = s.trim();
  if (t.startsWith('[')) {
    try { const arr = JSON.parse(t); if (Array.isArray(arr)) return arr.map(String).filter(Boolean); } catch {}
  }
  return t.split(/[|;]/).flatMap((p) => p.split(',')).map((p) => p.trim()).filter(Boolean);
}

let ensuredCostCol = false;
async function ensureCostColumn() {
  if (ensuredCostCol) return;
  try { await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)`); ensuredCostCol = true; }
  catch (e) { console.warn('[import] could not add cost_price column:', (e as Error).message); }
}

function gbpOrNull(v: string | undefined): string | null {
  if (!v?.trim()) return null;
  const n = Number(v.replace(/[^0-9.]/g,''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await ensureCostColumn();
    const text = await req.text();
    const rows = parseCsv(text);
    if (!rows.length) return NextResponse.json({ error: "No rows found." }, { status: 400 });
    let updated = 0, created = 0, createdCategories = 0, updatedProducts = 0;
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // spreadsheet row (header = row 1)
      const sku = (r.sku || "").trim();
      const stock = parseInt(r.stock || "0", 10) || 0;
      const price = (r.price || "").trim() || null;
      const costPrice = gbpOrNull(r.cost_price || r.supplier_cost || r.cost);
      const threshold = parseInt(r.low_stock_threshold || "10", 10) || 10;
      const isActive = r.is_active ? r.is_active.toLowerCase() !== "false" : true;
      const images = parseImageList(r.images || r.image_urls);
      const description = (r.description || "").trim();

      try {
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

          if (description || images.length || costPrice || r.brand?.trim() || r.product_name?.trim()) {
            const prodPatch: Record<string, unknown> = {};
            if (description) prodPatch.description = description;
            if (images.length) prodPatch.images = images;
            if (costPrice) prodPatch.costPrice = costPrice as any;
            if (r.brand?.trim()) prodPatch.brand = r.brand.trim();
            if (r.product_name?.trim()) prodPatch.name = r.product_name.trim();
            if (Object.keys(prodPatch).length) {
              await db.update(products).set(prodPatch).where(eq(products.id, existing[0].productId));
              updatedProducts++;
            }
          }
          updated++;
          continue;
        }
      }

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
          description,
          basePrice: String(price || "9.99"),
          costPrice: costPrice as any,
          images: images.length ? images : [],
          tags: [],
          isActive: true,
        } as any).returning({ id: products.id });
        productId = ins[0].id;
      } else {
        const patch: Record<string, unknown> = {};
        if (description) patch.description = description;
        if (images.length) patch.images = images;
        if (costPrice) patch.costPrice = costPrice as any;
        if (r.brand?.trim()) patch.brand = r.brand.trim();
        if (r.category && !existingProd[0].categoryId) {
          const cid = await resolveCategory(r.category);
          if (cid) { patch.categoryId = cid; createdCategories++; }
        }
        if (Object.keys(patch).length) { await db.update(products).set(patch).where(eq(products.id, productId)); updatedProducts++; }
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
      } catch (e: any) {
        const ref = sku || (r.product_name || "").trim() || `row ${rowNum}`;
        errors.push(`Row ${rowNum} (${ref}): ${e?.message || 'unknown error'}`);
      }
    }
    return NextResponse.json({ ok: true, updated, created, createdCategories, updatedProducts, total: rows.length, errors });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Import failed: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
