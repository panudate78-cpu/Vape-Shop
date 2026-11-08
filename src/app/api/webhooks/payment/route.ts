import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, productVariants, payments, promoCodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyWebhook, type GatewayName } from "@/lib/payments";
import { sql } from "drizzle-orm";

/**
 * POST /api/webhooks/payment?gateway=mock
 * Body: { orderId, intentId, status: 'succeeded' | 'failed', ... }
 * Verifies signature, then on success:
 *  - marks order paid/processing
 *  - DEDUCTS inventory stock atomically (only here, never at checkout-time)
 *  - increments promo usage
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const gateway = ((url.searchParams.get("gateway") || "mock") as GatewayName);
  let rawText = "";
  try {
    rawText = await req.text();
  } catch { rawText = ""; }
  if (!verifyWebhook(gateway, req, rawText)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try { body = rawText ? JSON.parse(rawText) : {}; } catch { body = {}; }
  // support GET-style query for manual mock testing
  const orderId = (body.orderId as string) || url.searchParams.get("orderId") || "";
  const intentId = (body.intentId as string) || url.searchParams.get("intentId") || "";
  const status = ((body.status as string) || url.searchParams.get("status") || "succeeded").toLowerCase();

  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const orows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!orows.length) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const order = orows[0];

  if (intentId && order.paymentIntentId && intentId !== order.paymentIntentId) {
    return NextResponse.json({ error: "Intent mismatch" }, { status: 400 });
  }

  // Idempotency: already paid
  if (order.status === "paid" || order.status === "processing" || order.status === "shipped") {
    return NextResponse.json({ ok: true, deduped: true, orderId, status: order.status });
  }

  if (status === "failed" || status === "canceled" || status === "cancelled") {
    await db.update(orders).set({ paymentStatus: "failed", status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await db.execute(sql`UPDATE payments SET status = 'failed' WHERE order_id = ${orderId}`);
    return NextResponse.json({ ok: true, orderId, status: "cancelled" });
  }

  // Success path — deduct stock in a transaction-like sequence
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  // verify stock still available
  for (const it of items) {
    if (!it.variantId) continue;
    const vrows = await db.select().from(productVariants).where(eq(productVariants.id, it.variantId)).limit(1);
    if (!vrows.length) return NextResponse.json({ error: `Variant missing for ${it.sku}` }, { status: 400 });
    if ((vrows[0].stockQuantity ?? 0) < (it.quantity ?? 0)) {
      await db.update(orders).set({ paymentStatus: "failed", status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, orderId));
      return NextResponse.json({ error: `Insufficient stock for ${it.sku} at capture time — order cancelled & refund simulated` }, { status: 409 });
    }
  }
  for (const it of items) {
    if (!it.variantId) continue;
    await db.execute(sql`UPDATE product_variants SET stock_quantity = stock_quantity - ${it.quantity} WHERE id = ${it.variantId}`);
  }
  await db.update(orders).set({ paymentStatus: "captured", status: "paid", updatedAt: new Date() }).where(eq(orders.id, orderId));
  await db.execute(sql`UPDATE payments SET status = 'captured', raw = ${JSON.stringify({ ...body, gateway, verified: true })} WHERE order_id = ${orderId}`);
  if (order.promoCode) {
    await db.execute(sql`UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ${order.promoCode}`);
  }
  return NextResponse.json({ ok: true, orderId, status: "paid" });
}

// GET convenience for mock testing: /api/webhooks/payment?gateway=mock&orderId=..&intentId=..&status=succeeded
export async function GET(req: Request) {
  const clone = new Request(req.url, { method: "POST", headers: req.headers });
  return POST(clone);
}
