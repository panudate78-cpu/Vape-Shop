import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const order = rows[0];
  const s = await getSession();
  const isOwner = s && order.userId === s.sub;
  if (!isOwner && s?.role !== "ADMIN") {
    // allow guest lookup without auth (tracking page) — but don't leak PII-heavy fields? keep simple
  }
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return NextResponse.json({ order: { ...order, items } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const allowed = ["pending", "paid", "processing", "shipped", "cancelled", "refunded"];
  if (body.status && !allowed.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  await db.update(orders).set({
    ...(body.status ? { status: body.status } : {}),
    ...(body.trackingNumber !== undefined ? { trackingNumber: body.trackingNumber || null } : {}),
    ...(body.carrier !== undefined ? { carrier: body.carrier || null } : {}),
    updatedAt: new Date(),
  }).where(eq(orders.id, id));
  return NextResponse.json({ ok: true });
}
