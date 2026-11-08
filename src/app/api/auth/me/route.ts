import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null });
  const rows = await db.select().from(users).where(eq(users.id, s.sub)).limit(1);
  if (!rows.length) return NextResponse.json({ user: null });
  const u = rows[0];
  return NextResponse.json({ user: { id: u.id, email: u.email, role: u.role, fullName: u.fullName, dob: u.dob } });
}
