import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/session";
import { ensurePosSchema } from "@/lib/pos-schema";

export const dynamic = "force-dynamic";

// Receipt / return-screen data for one order: lines, payments, parent sale
// (if this is a return) and any returns already made against this sale.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const a = await requireStaff();
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensurePosSchema();
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const pays = await db.select().from(payments).where(eq(payments.orderId, id));
  const returns = await db.select({ id: orders.id, totalAmount: orders.totalAmount, createdAt: orders.createdAt })
    .from(orders).where(eq(orders.parentOrderId, id));
  return NextResponse.json({
    order: {
      id: o.id, status: o.status, source: o.source, createdAt: o.createdAt,
      subtotal: Number(o.subtotal), discount: Number(o.discount), total: Number(o.totalAmount),
      paymentMethod: o.paymentMethod, paymentBreakdown: o.paymentBreakdown,
      cashTendered: o.cashTendered != null ? Number(o.cashTendered) : null,
      changeGiven: o.changeGiven != null ? Number(o.changeGiven) : null,
      parentOrderId: o.parentOrderId, refundReason: o.refundReason, staffNote: o.staffNote,
      receiptEmailedTo: o.receiptEmailedTo,
    },
    lines: lines.map((l) => ({ id: l.id, variantId: l.variantId, productName: l.productName, variantLabel: l.variantLabel, sku: l.sku, quantity: l.quantity, unitPrice: Number(l.unitPrice) })),
    payments: pays.map((p) => ({ amount: Number(p.amount), gateway: p.gateway, status: p.status, method: (p.raw as any)?.paymentMethod ?? null })),
    returns: returns.map((r) => ({ id: r.id, total: Number(r.totalAmount), createdAt: r.createdAt })),
  });
}
