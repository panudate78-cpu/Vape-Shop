import { NextResponse } from "next/server";
import { db } from "@/db";
import { addresses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ addresses: [] });
  const rows = await db.select().from(addresses).where(eq(addresses.userId, s.sub));
  return NextResponse.json({ addresses: rows });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const b = await req.json();
  const inserted = await db.insert(addresses).values({
    userId: s.sub,
    label: b.label || "Home",
    fullName: b.fullName || null,
    line1: b.line1 || null,
    line2: b.line2 || null,
    city: b.city || null,
    postcode: b.postcode || null,
    country: b.country || "United Kingdom",
    phone: b.phone || null,
    isDefault: !!b.isDefault,
  }).returning();
  return NextResponse.json({ address: inserted[0] });
}

export async function DELETE(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`DELETE FROM addresses WHERE id = ${id} AND user_id = ${s.sub}`);
  return NextResponse.json({ ok: true });
}
