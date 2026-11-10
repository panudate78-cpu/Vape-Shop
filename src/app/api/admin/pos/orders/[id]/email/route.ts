import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { ensurePosSchema } from "@/lib/pos-schema";
import { z } from "zod";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// POST { email } → emails a plain receipt for an in-store sale or return.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensurePosSchema();
  const parsed = z.object({ email: z.string().email().max(200) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  const id = Number(params.id);
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, id));

  const rows = lines.map((l) => `<tr><td>${esc(l.productName)} — ${esc(l.variantLabel)}</td><td style="text-align:right">${l.quantity}</td><td style="text-align:right">£${Number(l.unitPrice).toFixed(2)}</td></tr>`).join("");
  const isRefund = Number(o.totalAmount) < 0;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px">
    <h2>${isRefund ? "Refund receipt" : "Receipt"} #${o.id}</h2>
    <p>${new Date(o.createdAt).toLocaleString("en-GB")}</p>
    <table width="100%" cellpadding="4" style="border-collapse:collapse">${rows}</table>
    <p><strong>Total: £${Number(o.totalAmount).toFixed(2)}</strong></p>
    ${o.refundReason ? `<p>Reason: ${esc(o.refundReason)}</p>` : ""}
    <p>Thank you for visiting Vape Club 100. Please keep this receipt for returns within 14 days.</p>
  </div>`;
  const text = lines.map((l) => `${l.productName} (${l.variantLabel}) x${l.quantity} @ £${Number(l.unitPrice).toFixed(2)}`).join("\n") + `\nTotal: £${Number(o.totalAmount).toFixed(2)}`;

  const r = await sendEmail({ to: { email: parsed.data.email }, subject: `${isRefund ? "Refund receipt" : "Your receipt"} #${o.id} — Vape Club 100`, html, text });
  if (!r.ok) return NextResponse.json({ error: r.error || "Email failed to send" }, { status: 502 });
  await db.update(orders).set({ receiptEmailedTo: parsed.data.email }).where(eq(orders.id, id));
  return NextResponse.json({ ok: true, provider: r.provider });
}
