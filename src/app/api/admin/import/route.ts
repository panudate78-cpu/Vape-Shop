import { NextResponse } from "next/server";
import { db } from "@/db";
import { productVariants, products, categories } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireOwner } from "@/lib/session";
import { audit } from "@/lib/audit";
import { ensurePosSchema } from "@/lib/pos-schema";

// Import rules:
// - A blank cell never changes an existing value. It only fills a value for a new product or variant.
// - Invalid values (price, stock, threshold, cost, barcode, is_active, image URLs) reject that row with a message.
// - Duplicate SKUs or barcodes within one file are rejected on the second occurrence.

type ParsedCsv = { headers: Set<string>; rows: Record<string, string>[] };

function parseCsv(text: string): ParsedCsv {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length < 2) return { headers: new Set(), rows: [] };
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
  while (headerIdx < lines.length && (lines[headerIdx].trim().startsWith("#") || !lines[headerIdx].trim())) headerIdx++;
  if (headerIdx >= lines.length) return { headers: new Set(), rows: [] };
  const headerList = splitLine(lines[headerIdx]).map((h) => h.toLowerCase().trim().replace(/\s+/g, "_"));
  const rows: Record<string, string>[] = [];
  for (const raw of lines.slice(headerIdx + 1)) {
    const l = raw.trim();
    if (!l || l.startsWith("#")) continue;
    const cells = splitLine(l);
    const obj: Record<string, string> = {};
    headerList.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    rows.push(obj);
  }
  return { headers: new Set(headerList), rows };
}

async function resolveCategory(name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = await db.select({ id: categories.id }).from(categories).where(sql`lower(${categories.name}) = lower(${trimmed})`).limit(1);
  if (existing[0]) return existing[0].id;
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [cat] = await db.insert(categories).values({ name: trimmed, slug, description: "" }).returning({ id: categories.id });
  return cat.id;
}

class RowError extends Error {}

// Returns the list of https image URLs, or throws a RowError naming the bad value.
function parseImageList(s: string): string[] {
  const t = s.trim();
  let list: string[];
  if (t.startsWith("[")) {
    let arr: unknown;
    try { arr = JSON.parse(t); } catch { throw new RowError("images must be https:// links separated by | or ;"); }
    if (!Array.isArray(arr)) throw new RowError("images must be https:// links separated by | or ;");
    list = arr.map(String);
  } else {
    list = t.split(/[|;]/).flatMap((p) => p.split(",")).map((p) => p.trim());
  }
  list = list.map((u) => u.trim()).filter(Boolean);
  for (const u of list) {
    if (/\s/.test(u)) throw new RowError(`image link contains a space: ${u.slice(0, 80)}`);
    let parsed: URL;
    try { parsed = new URL(u); } catch { throw new RowError(`image link is not a valid URL: ${u.slice(0, 80)}`); }
    if (parsed.protocol !== "https:") throw new RowError(`image link must start with https://: ${u.slice(0, 80)}`);
  }
  return list;
}

let ensuredCostCol = false;
async function ensureCostColumn() {
  if (ensuredCostCol) return;
  try { await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)`); ensuredCostCol = true; }
  catch (e) { console.warn("[import] could not add cost_price column:", (e as Error).message); }
}

// Money: "14.99" or "£14.99". Must be above 0 with at most 2 decimals.
function parseMoney(v: string, field: string): string {
  const s = v.trim().replace(/^£/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) <= 0) throw new RowError(`${field} must be a price above 0 with at most 2 decimals (e.g. 14.99), got "${v}"`);
  return Number(s).toFixed(2);
}

// Whole number, zero or more.
function parseWhole(v: string, field: string): number {
  const s = v.trim();
  if (!/^\d+$/.test(s)) throw new RowError(`${field} must be a whole number of 0 or more, got "${v}"`);
  return Number(s);
}

function parseBool(v: string, field: string): boolean {
  const s = v.trim().toLowerCase();
  if (["true", "yes", "1", "y"].includes(s)) return true;
  if (["false", "no", "0", "n"].includes(s)) return false;
  throw new RowError(`${field} must be true or false, got "${v}"`);
}

function parseBarcode(v: string): string {
  const s = v.trim();
  if (!/^\d{8,14}$/.test(s)) throw new RowError(`barcode must be 8 to 14 digits (EAN/UPC), got "${v}"`);
  return s;
}

export async function POST(req: Request) {
  const s = await requireOwner();
  if (!s) return NextResponse.json({ error: "Forbidden — only the owner can import" }, { status: 403 });
  await ensurePosSchema(); // adds product_variants.barcode if missing
  try {
    await ensureCostColumn();
    const text = await req.text();
    const { headers, rows } = parseCsv(text);
    if (!rows.length) return NextResponse.json({ error: "No rows found." }, { status: 400 });
    const has = (col: string) => headers.has(col);
    const cell = (r: Record<string, string>, col: string) => (r[col] ?? "").trim();

    let updated = 0, created = 0, createdCategories = 0, updatedProducts = 0;
    const errors: string[] = [];
    const rowErrors: { row: number; ref: string; message: string }[] = [];
    const seenSku = new Set<string>();
    const seenBarcode = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // spreadsheet row (header = row 1)
      const sku = cell(r, "sku");
      const ref = sku || cell(r, "product_name") || `row ${rowNum}`;
      try {
        // ---- validate everything before touching the database for this row ----
        const patch: Record<string, unknown> = {};          // variant fields that really change
        const productPatch: Record<string, unknown> = {};   // product fields that really change

        if (has("price") && cell(r, "price")) patch.priceOverride = parseMoney(cell(r, "price"), "price");
        if (has("stock") && cell(r, "stock") !== "") patch.stockQuantity = parseWhole(cell(r, "stock"), "stock");
        if (has("low_stock_threshold") && cell(r, "low_stock_threshold") !== "") patch.lowStockThreshold = parseWhole(cell(r, "low_stock_threshold"), "low_stock_threshold");
        if (has("is_active") && cell(r, "is_active") !== "") patch.isActive = parseBool(cell(r, "is_active"), "is_active");
        if (has("flavor") && cell(r, "flavor")) patch.flavor = cell(r, "flavor");
        if (has("nicotine_strength") && cell(r, "nicotine_strength")) patch.nicotineStrength = cell(r, "nicotine_strength");
        if (has("bottle_size") && cell(r, "bottle_size")) patch.bottleSize = cell(r, "bottle_size");
        if (has("color") && cell(r, "color")) patch.color = cell(r, "color");
        if (has("barcode") && cell(r, "barcode")) patch.barcode = parseBarcode(cell(r, "barcode"));

        const costRaw = cell(r, "cost_price") || cell(r, "supplier_cost") || cell(r, "cost");
        const costPrice = costRaw ? parseMoney(costRaw, "cost_price") : null;
        const imagesRaw = cell(r, "images") || cell(r, "image_urls");
        const images = imagesRaw ? parseImageList(imagesRaw) : [];
        const description = cell(r, "description");
        const brand = cell(r, "brand");
        const productName = cell(r, "product_name");
        const categoryName = cell(r, "category");

        if (costPrice) productPatch.costPrice = costPrice;
        if (images.length) productPatch.images = images;
        if (description) productPatch.description = description;
        if (brand) productPatch.brand = brand;
        if (productName) productPatch.name = productName;

        // duplicates inside this file
        if (sku) {
          if (seenSku.has(sku)) throw new RowError(`SKU ${sku} appears more than once in this file`);
          seenSku.add(sku);
        }
        const barcode = patch.barcode as string | undefined;
        if (barcode) {
          if (seenBarcode.has(barcode)) throw new RowError(`barcode ${barcode} appears more than once in this file`);
          seenBarcode.add(barcode);
        }

        // ---- database work for this row ----
        if (barcode) {
          const dup = await db.select({ sku: productVariants.sku }).from(productVariants).where(eq(productVariants.barcode, barcode)).limit(1);
          if (dup.length && dup[0].sku !== sku) throw new RowError(`barcode ${barcode} already used by variant ${dup[0].sku}`);
        }

        if (sku) {
          const existing = await db.select().from(productVariants).where(eq(productVariants.sku, sku)).limit(1);
          if (existing.length) {
            if (Object.keys(patch).length) await db.update(productVariants).set(patch as any).where(eq(productVariants.sku, sku));
            if (Object.keys(productPatch).length) {
              await db.update(products).set(productPatch as any).where(eq(products.id, existing[0].productId));
              updatedProducts++;
            }
            if (categoryName) {
              const cid = await resolveCategory(categoryName);
              if (cid) {
                await db.update(products).set({ categoryId: cid }).where(eq(products.id, existing[0].productId));
                createdCategories++;
              }
            }
            updated++;
            continue;
          }
        }

        // new product or new variant
        if (!productName) throw new RowError("product_name is required for a new product");
        const existingProd = await db.select({ id: products.id, categoryId: products.categoryId }).from(products).where(sql`lower(${products.name}) = lower(${productName})`).limit(1);
        let productId = existingProd[0]?.id;
        if (!productId) {
          if (patch.priceOverride === undefined) throw new RowError("price is required for a new product");
          const catId = categoryName ? await resolveCategory(categoryName) : null;
          if (catId) createdCategories++;
          const ins = await db.insert(products).values({
            categoryId: catId,
            name: productName,
            brand: brand || "House Brand",
            description,
            basePrice: String(patch.priceOverride),
            costPrice: costPrice as any,
            images,
            tags: [],
            isActive: true,
          } as any).returning({ id: products.id });
          productId = ins[0].id;
        } else {
          if (Object.keys(productPatch).length) { await db.update(products).set(productPatch as any).where(eq(products.id, productId)); updatedProducts++; }
          if (categoryName && !existingProd[0].categoryId) {
            const cid = await resolveCategory(categoryName);
            if (cid) { await db.update(products).set({ categoryId: cid }).where(eq(products.id, productId)); createdCategories++; }
          }
        }
        await db.insert(productVariants).values({
          productId,
          sku: sku || `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          flavor: (patch.flavor as string) ?? null,
          nicotineStrength: (patch.nicotineStrength as string) ?? null,
          bottleSize: (patch.bottleSize as string) ?? null,
          color: (patch.color as string) ?? null,
          barcode: barcode ?? null,
          priceOverride: (patch.priceOverride as string) ?? null,
          stockQuantity: (patch.stockQuantity as number) ?? 0,
          lowStockThreshold: (patch.lowStockThreshold as number) ?? 10,
          isActive: (patch.isActive as boolean) ?? true,
        });
        created++;
      } catch (e: any) {
        const message = e instanceof RowError ? e.message : (e?.message || "unknown error");
        errors.push(`Row ${rowNum} (${ref}): ${message}`);
        rowErrors.push({ row: rowNum, ref, message });
      }
    }
    await audit(s, "import.run", "products", null, { created, updated, updatedProducts, rejected: rowErrors.length, total: rows.length });
    return NextResponse.json({ ok: true, updated, created, createdCategories, updatedProducts, total: rows.length, errors, rowErrors });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Import failed: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
