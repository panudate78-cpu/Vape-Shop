import { NextResponse } from "next/server";
import { db } from "@/db";
import { productVariants, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const prods = await db.select().from(products);
  const vars = await db.select().from(productVariants);
  const pmap = Object.fromEntries(prods.map((p) => [p.id, p]));
  const header = "product_name,brand,sku,flavor,nicotine_strength,bottle_size,color,price,stock,low_stock_threshold,is_active";
  const lines = vars.map((v) => {
    const p = pmap[v.productId];
    const price = v.priceOverride ?? p?.basePrice ?? "0";
    const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    return [esc(p?.name), esc(p?.brand), esc(v.sku), esc(v.flavor), esc(v.nicotineStrength), esc(v.bottleSize), esc(v.color), esc(price), v.stockQuantity, v.lowStockThreshold, v.isActive].join(",");
  });
  const csv = [header, ...lines].join("\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=inventory.csv" },
  });
}
