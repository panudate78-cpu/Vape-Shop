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
// - ?mode=preview plans the import and writes nothing. ?mode=apply (default) runs the same plan.
//   Apply rows are written one at a time; a row that fails is reported and the others still go in.

type ParsedCsv = { headerList: string[]; rows: Record<string, string>[] };

function parseCsv(text: string): ParsedCsv {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length < 2) return { headerList: [], rows: [] };
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
  if (headerIdx >= lines.length) return { headerList: [], rows: [] };
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
  return { headerList, rows };
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

const VARIANT_LABELS: Record<string, string> = {
  priceOverride: "price", stockQuantity: "stock", lowStockThreshold: "low_stock_threshold", isActive: "is_active",
  flavor: "flavor", nicotineStrength: "nicotine_strength", bottleSize: "bottle_size", color: "color", barcode: "barcode",
};
const PRODUCT_LABELS: Record<string, string> = {
  costPrice: "cost_price", images: "images", description: "description", brand: "brand", name: "product_name",
};

// Comparable string form of a stored or incoming value (null = empty).
function norm(field: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (field === "images") return JSON.stringify(Array.isArray(v) ? v : []);
  if (field === "isActive") return v ? "true" : "false";
  if (field === "priceOverride" || field === "costPrice") return Number(v).toFixed(2);
  return String(v);
}
// Human form for the preview and history.
function shown(field: string, v: string | null): string | null {
  if (v === null) return null;
  if (field === "images") { try { return (JSON.parse(v) as string[]).join(" | ") || null; } catch { return v; } }
  return v;
}

type Change = { field: string; from: string | null; to: string | null };
type Action = "create" | "update" | "unchanged" | "reject";
type Plan = {
  row: number; ref: string; sku: string; raw: Record<string, string>;
  action: Action; kind: string; changes: Change[]; message?: string;
  productChanged: boolean; categoryNew: boolean;
  apply?: () => Promise<void>;
};
type Ctx = {
  newProducts: Map<string, number>;        // lower-case name -> id, filled during apply
  plannedNewProducts: Set<string>;         // lower-case names that a row in this file will create
  plannedCategories: Set<string>;          // lower-case category names this file will create
};

async function resolveCategory(name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = await db.select({ id: categories.id }).from(categories).where(sql`lower(${categories.name}) = lower(${trimmed})`).limit(1);
  if (existing[0]) return existing[0].id;
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [cat] = await db.insert(categories).values({ name: trimmed, slug, description: "" }).returning({ id: categories.id });
  return cat.id;
}

async function categoryExists(name: string): Promise<boolean> {
  const r = await db.select({ id: categories.id }).from(categories).where(sql`lower(${categories.name}) = lower(${name.trim()})`).limit(1);
  return r.length > 0;
}

let ensuredCostCol = false;
async function ensureCostColumn() {
  if (ensuredCostCol) return;
  try { await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)`); ensuredCostCol = true; }
  catch (e) { console.warn("[import] could not add cost_price column:", (e as Error).message); }
}

async function planRow(
  r: Record<string, string>, rowNum: number, headers: Set<string>, ctx: Ctx,
  seenSku: Set<string>, seenBarcode: Set<string>,
): Promise<Plan> {
  const has = (col: string) => headers.has(col);
  const cell = (col: string) => (r[col] ?? "").trim();
  const sku = cell("sku");
  const ref = sku || cell("product_name") || `row ${rowNum}`;
  const base = { row: rowNum, ref, sku, raw: r, productChanged: false, categoryNew: false };

  // ---- validate values first ----
  const patch: Record<string, unknown> = {};   // variant fields given in this row
  if (has("price") && cell("price")) patch.priceOverride = parseMoney(cell("price"), "price");
  if (has("stock") && cell("stock") !== "") patch.stockQuantity = parseWhole(cell("stock"), "stock");
  if (has("low_stock_threshold") && cell("low_stock_threshold") !== "") patch.lowStockThreshold = parseWhole(cell("low_stock_threshold"), "low_stock_threshold");
  if (has("is_active") && cell("is_active") !== "") patch.isActive = parseBool(cell("is_active"), "is_active");
  if (has("flavor") && cell("flavor")) patch.flavor = cell("flavor");
  if (has("nicotine_strength") && cell("nicotine_strength")) patch.nicotineStrength = cell("nicotine_strength");
  if (has("bottle_size") && cell("bottle_size")) patch.bottleSize = cell("bottle_size");
  if (has("color") && cell("color")) patch.color = cell("color");
  if (has("barcode") && cell("barcode")) patch.barcode = parseBarcode(cell("barcode"));

  const costRaw = cell("cost_price") || cell("supplier_cost") || cell("cost");
  const costPrice = costRaw ? parseMoney(costRaw, "cost_price") : null;
  const imagesRaw = cell("images") || cell("image_urls");
  const images = imagesRaw ? parseImageList(imagesRaw) : [];
  const productPatch: Record<string, unknown> = {};  // product fields given in this row
  if (costPrice) productPatch.costPrice = costPrice;
  if (images.length) productPatch.images = images;
  if (cell("description")) productPatch.description = cell("description");
  if (cell("brand")) productPatch.brand = cell("brand");
  const productName = cell("product_name");
  if (productName) productPatch.name = productName;
  const categoryName = cell("category");

  // ---- duplicates inside this file ----
  if (sku) {
    if (seenSku.has(sku)) throw new RowError(`SKU ${sku} appears more than once in this file`);
    seenSku.add(sku);
  }
  const barcode = patch.barcode as string | undefined;
  if (barcode) {
    if (seenBarcode.has(barcode)) throw new RowError(`barcode ${barcode} appears more than once in this file`);
    seenBarcode.add(barcode);
    const dup = await db.select({ sku: productVariants.sku }).from(productVariants).where(eq(productVariants.barcode, barcode)).limit(1);
    if (dup.length && dup[0].sku !== sku) throw new RowError(`barcode ${barcode} already used by variant ${dup[0].sku}`);
  }

  // ---- existing variant: update or unchanged ----
  if (sku) {
    const [existing] = await db
      .select({ v: productVariants, p: products })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(productVariants.sku, sku))
      .limit(1);
    if (existing) {
      const changes: Change[] = [];
      for (const [key, label] of Object.entries(VARIANT_LABELS)) {
        if (!(key in patch)) continue;
        const from = norm(key, (existing.v as any)[key]);
        const to = norm(key, patch[key]);
        if (from !== to) changes.push({ field: label, from: shown(key, from), to: shown(key, to) });
      }
      const productChanges: Change[] = [];
      for (const [key, label] of Object.entries(PRODUCT_LABELS)) {
        if (!(key in productPatch)) continue;
        const dbKey = key === "name" ? "name" : key;
        const from = norm(key, (existing.p as any)[dbKey]);
        const to = norm(key, productPatch[key]);
        if (from !== to) productChanges.push({ field: label, from: shown(key, from), to: shown(key, to) });
      }
      let categoryChange: Change | null = null;
      if (categoryName) {
        const [cur] = existing.p.categoryId
          ? await db.select({ name: categories.name }).from(categories).where(eq(categories.id, existing.p.categoryId)).limit(1)
          : [];
        if (!cur || cur.name.toLowerCase() !== categoryName.toLowerCase()) {
          categoryChange = { field: "category", from: cur?.name ?? null, to: categoryName };
        }
      }
      const allChanges = [...changes, ...productChanges, ...(categoryChange ? [categoryChange] : [])];
      const action: Action = allChanges.length ? "update" : "unchanged";
      const categoryNew = !!categoryChange && !(await categoryExists(categoryName));
      return {
        ...base, action, kind: "existing variant", changes: allChanges,
        productChanged: productChanges.length > 0 || !!categoryChange, categoryNew,
        apply: action === "update" ? async () => {
          if (Object.keys(patch).length) await db.update(productVariants).set(patch as any).where(eq(productVariants.sku, sku));
          if (Object.keys(productPatch).length) await db.update(products).set(productPatch as any).where(eq(products.id, existing.p.id));
          if (categoryChange) {
            const cid = await resolveCategory(categoryName);
            if (cid) await db.update(products).set({ categoryId: cid }).where(eq(products.id, existing.p.id));
          }
        } : undefined,
      };
    }
  }

  // ---- new variant or new product ----
  if (!productName) throw new RowError("product_name is required for a new product");
  const lname = productName.toLowerCase();
  const [existingProd] = await db
    .select({ id: products.id, categoryId: products.categoryId, name: products.name, brand: products.brand, description: products.description, images: products.images, costPrice: products.costPrice })
    .from(products).where(sql`lower(${products.name}) = ${lname}`).limit(1);
  const pendingInFile = !existingProd && ctx.plannedNewProducts.has(lname);
  if (!existingProd && !pendingInFile && patch.priceOverride === undefined) throw new RowError("price is required for a new product");
  if (!existingProd) ctx.plannedNewProducts.add(lname);

  const changes: Change[] = [];
  const labelFor = (key: string) => VARIANT_LABELS[key] ?? key;
  for (const [key, val] of Object.entries(patch)) changes.push({ field: labelFor(key), from: null, to: shown(key, norm(key, val)) });
  let productChanged = false;
  if (existingProd) {
    for (const [key, label] of Object.entries(PRODUCT_LABELS)) {
      if (!(key in productPatch)) continue;
      const from = norm(key, (existingProd as any)[key]);
      const to = norm(key, productPatch[key]);
      if (from !== to) { changes.push({ field: label, from: shown(key, from), to: shown(key, to) }); productChanged = true; }
    }
  }
  let categoryNew = false;
  if (categoryName && (!existingProd || !existingProd.categoryId)) {
    changes.push({ field: "category", from: null, to: categoryName });
    if (!(await categoryExists(categoryName)) && !ctx.plannedCategories.has(categoryName.toLowerCase())) {
      categoryNew = true;
      ctx.plannedCategories.add(categoryName.toLowerCase());
    }
  }

  const kind = existingProd ? "new variant" : pendingInFile ? "new variant (product created earlier in this file)" : "new product";
  return {
    ...base, action: "create", kind, changes, productChanged, categoryNew,
    apply: async () => {
      let productId: number | undefined = existingProd?.id ?? ctx.newProducts.get(lname);
      if (productId === undefined) {
        const catId = categoryName ? await resolveCategory(categoryName) : null;
        const ins = await db.insert(products).values({
          categoryId: catId,
          name: productName,
          brand: cell("brand") || "House Brand",
          description: cell("description"),
          basePrice: String(patch.priceOverride),
          costPrice: costPrice as any,
          images,
          tags: [],
          isActive: true,
        } as any).returning({ id: products.id });
        productId = ins[0].id;
        ctx.newProducts.set(lname, productId);
      } else if (existingProd) {
        if (Object.keys(productPatch).length) await db.update(products).set(productPatch as any).where(eq(products.id, productId));
        if (categoryName && !existingProd.categoryId) {
          const cid = await resolveCategory(categoryName);
          if (cid) await db.update(products).set({ categoryId: cid }).where(eq(products.id, productId));
        }
      }
      if (productId === undefined) throw new RowError("the product for this name could not be created earlier in this file");
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
    },
  };
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function POST(req: Request) {
  const s = await requireOwner();
  if (!s) return NextResponse.json({ error: "Forbidden — only the owner can import" }, { status: 403 });
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "preview" ? "preview" : "apply";
  const filename = (url.searchParams.get("filename") || "").slice(0, 160);
  await ensurePosSchema(); // adds product_variants.barcode if missing
  try {
    await ensureCostColumn();
    const text = await req.text();
    const { headerList, rows } = parseCsv(text);
    if (!rows.length) return NextResponse.json({ error: "No rows found." }, { status: 400 });
    const headers = new Set(headerList);

    // ---- plan every row (reads only) ----
    const ctx: Ctx = { newProducts: new Map(), plannedNewProducts: new Set(), plannedCategories: new Set() };
    const seenSku = new Set<string>(), seenBarcode = new Set<string>();
    const plans: Plan[] = [];
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // spreadsheet row (header = row 1)
      try {
        plans.push(await planRow(rows[i], rowNum, headers, ctx, seenSku, seenBarcode));
      } catch (e: any) {
        const sku = (rows[i].sku ?? "").trim();
        const ref = sku || (rows[i].product_name ?? "").trim() || `row ${rowNum}`;
        plans.push({
          row: rowNum, ref, sku, raw: rows[i], action: "reject", kind: "rejected", changes: [],
          message: e instanceof RowError ? e.message : (e?.message || "unknown error"), productChanged: false, categoryNew: false,
        });
      }
    }

    // ---- apply (writes), one row at a time ----
    if (mode === "apply") {
      for (const p of plans) {
        if (p.action === "reject" || !p.apply) continue;
        try {
          await p.apply();
        } catch (e: any) {
          p.action = "reject";
          p.message = e instanceof RowError ? e.message : (e?.message || "database error");
        }
      }
    }

    const count = (a: Action) => plans.filter((p) => p.action === a).length;
    const created = count("create"), updated = count("update"), unchanged = count("unchanged"), rejected = count("reject");
    const updatedProducts = plans.filter((p) => p.action !== "reject" && p.productChanged).length;
    const createdCategories = plans.filter((p) => p.action !== "reject" && p.categoryNew).length;
    const rowErrors = plans.filter((p) => p.action === "reject").map((p) => ({ row: p.row, ref: p.ref, message: p.message || "rejected" }));

    // Corrections file: the rejected rows with their original columns and an error column.
    let rejectedCsv: string | null = null;
    if (rowErrors.length) {
      const head = [...headerList, "error"].map(csvCell).join(",");
      const lines = plans.filter((p) => p.action === "reject").map((p) => [...headerList.map((h) => p.raw[h] ?? ""), p.message].map(csvCell).join(","));
      rejectedCsv = [head, ...lines].join("\r\n");
    }

    const changeList = plans.filter((p) => p.action !== "unchanged").slice(0, 2000).map((p) => ({
      row: p.row, ref: p.ref, sku: p.sku || null, action: p.action, kind: p.kind,
      changes: p.changes.slice(0, 40), message: p.message ?? null,
    }));

    if (mode === "apply") {
      await audit(s, "import.apply", "products", null, {
        filename, total: rows.length, created, updated, unchanged, rejected, updatedProducts, createdCategories,
        changes: changeList, truncated: plans.filter((p) => p.action !== "unchanged").length > changeList.length,
      });
    }

    return NextResponse.json({
      ok: true, mode, total: rows.length,
      created, updated, unchanged, rejected, updatedProducts, createdCategories,
      errors: rowErrors.map((e) => `Row ${e.row} (${e.ref}): ${e.message}`),
      rowErrors, changes: changeList, rejectedCsv,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Import failed: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
