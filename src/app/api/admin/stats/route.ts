import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, productVariants, products, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const revenue = await db.execute(sql`SELECT COALESCE(SUM(total_amount::numeric),0) as total, COUNT(*) as count FROM orders WHERE status IN ('paid','processing','shipped')`);
  const pending = await db.execute(sql`SELECT COUNT(*) as count FROM orders WHERE status='pending'`);
  const lowStock = await db.execute(sql`SELECT COUNT(*) as count FROM product_variants WHERE stock_quantity <= low_stock_threshold`);
  const outOfStock = await db.execute(sql`SELECT COUNT(*) as count FROM product_variants WHERE stock_quantity <= 0`);
  const prodCount = await db.execute(sql`SELECT COUNT(*) as count FROM products`);
  const userCount = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
  const recent = await db.execute(sql`SELECT id, total_amount, status, created_at, guest_email FROM orders ORDER BY created_at DESC LIMIT 8`);
  return NextResponse.json({
    stats: {
      revenue: (revenue.rows[0] as Record<string, string>)?.total || "0",
      paidOrders: (revenue.rows[0] as Record<string, string>)?.count || "0",
      pending: (pending.rows[0] as Record<string, string>)?.count || "0",
      lowStock: (lowStock.rows[0] as Record<string, string>)?.count || "0",
      outOfStock: (outOfStock.rows[0] as Record<string, string>)?.count || "0",
      products: (prodCount.rows[0] as Record<string, string>)?.count || "0",
      users: (userCount.rows[0] as Record<string, string>)?.count || "0",
    },
    recent: recent.rows,
  });
}
