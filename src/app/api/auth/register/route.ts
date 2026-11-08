import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, signSession, setSessionCookie, getSession } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, fullName, dob } = body;
    if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be 8+ characters" }, { status: 400 });
    const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existing.length) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    const passwordHash = await hashPassword(password);
    const role = email.toLowerCase() === (process.env.ADMIN_EMAIL || "admin@vapeshop.co.uk").toLowerCase() ? "ADMIN" : "CUSTOMER";
    const inserted = await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash,
      fullName: fullName || null,
      dob: dob || null,
      role: role as "ADMIN" | "CUSTOMER",
    }).returning({ id: users.id, email: users.email, role: users.role, fullName: users.fullName });
    const user = inserted[0];
    const token = await signSession({ sub: user.id, email: user.email, role: user.role as "ADMIN" | "CUSTOMER" });
    await setSessionCookie(token);
    return NextResponse.json({ user });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null });
  const rows = await db.select().from(users).where(eq(users.id, s.sub)).limit(1);
  if (!rows.length) return NextResponse.json({ user: null });
  const u = rows[0];
  return NextResponse.json({ user: { id: u.id, email: u.email, role: u.role, fullName: u.fullName, dob: u.dob } });
}
