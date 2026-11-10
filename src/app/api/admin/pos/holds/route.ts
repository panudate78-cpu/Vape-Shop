import { NextResponse } from "next/server";
import { db } from "@/db";
import { heldBaskets } from "@/db/schema";
import { eq, isNull, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { ensurePosSchema } from "@/lib/pos-schema";
import { z } from "zod";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  variantId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  lineDiscountPct: z.number().min(0).max(100).optional(),
  name: z.string().optional(), label: z.string().optional(), sku: z.string().optional(),
});

// GET   → open (not yet resumed) held baskets
// POST  → hold the current basket { items, discount, discountPct, customerLabel, note }
// PATCH → { id, action: 'resume' } marks it resumed and returns its contents
// DELETE?id= → discard a held basket
export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensurePosSchema();
  const rows = await db.select().from(heldBaskets).where(isNull(heldBaskets.resumedAt)).orderBy(desc(heldBaskets.createdAt)).limit(50);
  return NextResponse.json({ holds: rows });
}

export async function POST(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensurePosSchema();
  const parsed = z.object({
    items: z.array(itemSchema).min(1),
    discount: z.number().min(0).optional().default(0),
    discountPct: z.number().min(0).max(100).optional().default(0),
    customerLabel: z.string().max(60).optional(),
    note: z.string().max(200).optional(),
  }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid basket" }, { status: 400 });
  const d = parsed.data;
  for (let attempt = 0; attempt < 5; attempt++) {
    const holdCode = `H${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      const [row] = await db.insert(heldBaskets).values({
        holdCode,
        customerLabel: d.customerLabel || null,
        items: d.items,
        discount: d.discount.toFixed(2),
        discountPct: d.discountPct.toFixed(2),
        note: d.note || null,
        heldBy: a.email ?? null,
      } as any).returning();
      return NextResponse.json({ ok: true, hold: row });
    } catch (e: any) {
      if (!/unique|duplicate/i.test(e?.message || "")) throw e;
    }
  }
  return NextResponse.json({ error: "Could not create hold code, try again" }, { status: 500 });
}

export async function PATCH(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensurePosSchema();
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id || body.action !== "resume") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const [row] = await db.update(heldBaskets).set({ resumedAt: new Date() })
    .where(eq(heldBaskets.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Hold not found or already resumed" }, { status: 404 });
  return NextResponse.json({ ok: true, hold: row });
}

export async function DELETE(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensurePosSchema();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await db.delete(heldBaskets).where(eq(heldBaskets.id, id));
  return NextResponse.json({ ok: true });
}
