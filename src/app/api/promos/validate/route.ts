import { NextResponse } from "next/server";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const { code, subtotal } = await req.json();
    if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });
    const rows = await db.select().from(promoCodes).where(eq(promoCodes.code, code.toUpperCase().trim())).limit(1);
    if (!rows.length || !rows[0].isActive) return NextResponse.json({ error: "Invalid promo code" }, { status: 404 });
    const p = rows[0];
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) return NextResponse.json({ error: "Promo expired" }, { status: 400 });
    if (p.usageLimit && (p.usedCount ?? 0) >= p.usageLimit) return NextResponse.json({ error: "Promo usage limit reached" }, { status: 400 });
    const sub = parseFloat(subtotal ?? 0);
    if (parseFloat(p.minOrder ?? "0") > sub) return NextResponse.json({ error: `Minimum order ${p.minOrder} applies` }, { status: 400 });
    const val = parseFloat(p.value ?? "0");
    const discount = p.type === "percent" ? (sub * val) / 100 : Math.min(val, sub);
    return NextResponse.json({ promo: { code: p.code, type: p.type, value: p.value, discount: Number(discount.toFixed(2)) } });
  } catch (e) {
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
