import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, signSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!rows.length) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    const u = rows[0];
    const ok = await verifyPassword(password, u.passwordHash);
    if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    const token = await signSession({ sub: u.id, email: u.email, role: u.role as "ADMIN" | "CUSTOMER" });
    await setSessionCookie(token);
    return NextResponse.json({ user: { id: u.id, email: u.email, role: u.role, fullName: u.fullName } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
