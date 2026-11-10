import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '@/lib/auth';
import { getSession } from '@/lib/session';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
  const { email, password } = parsed.data;
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!u) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  const ok = await verifyPassword(password, u.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  if (u.active === false) return NextResponse.json({ error: 'This account has been disabled. Ask the owner.' }, { status: 403 });
  const s = await getSession();
  s.user = { id: u.id, email: u.email, role: u.role as 'CUSTOMER' | 'ADMIN' | 'MANAGER' | 'CASHIER', fullName: u.fullName ?? undefined };
  await s.save();
  return NextResponse.json({ user: s.user });
}
