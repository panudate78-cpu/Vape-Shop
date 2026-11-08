import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getSession();
  const url = new URL(req.url);
  // Admin: list all with optional status filter
  if (s?.role === "ADMIN") {
    const status = url.searchParams.get("status");
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(200);
    const filtered = status ? rows.filter((o) => o.status === status) : rows;
    return NextResponse.json({ orders: filtered, isAdmin: true });
  }
  // Customer: own orders; guests can pass ?email=
  if (s) {
    const rows = await db.select().from(orders).where(eq(orders.userId, s.sub)).orderBy(desc(orders.createdAt)).limit(100);
    const withItems = await Promise.all(rows.map(async (o) => {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
      return { ...o, items };
    }));
    return NextResponse.json({ orders: withItems });
  }
  const email = url.searchParams.get("email");
  if (!email) return NextResponse.json({ orders: [], guest: true });
  const { ilike } = await import("drizzle-orm");
  const rows = await db.select().from(orders).where(ilike(orders.guestEmail, email)).orderBy(desc(orders.createdAt)).limit(50);
  const withItems = await Promise.all(rows.map(async (o) => {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    return { ...o, items };
  }));
  return NextResponse.json({ orders: withItems, guest: true });
}
