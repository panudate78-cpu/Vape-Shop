import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, isOfAge } from '@/lib/auth';
import { getSession } from '@/lib/session';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1).max(100),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 });
  const { email, password, fullName, dob } = parsed.data;
  if (!isOfAge(dob)) return NextResponse.json({ error: 'You must be 18 or over to register.' }, { status: 403 });
  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing[0]) return NextResponse.json({ error: 'Email already registered.' }, { status: 409 });
  const [u] = await db
    .insert(users)
    .values({ email: email.toLowerCase(), passwordHash: await hashPassword(password), fullName, dob, role: 'CUSTOMER' })
    .returning({ id: users.id, email: users.email, role: users.role, fullName: users.fullName });
  const s = await getSession();
  s.user = { id: u.id, email: u.email, role: u.role as 'CUSTOMER' | 'ADMIN' | 'MANAGER' | 'CASHIER', fullName: u.fullName ?? undefined };
  await s.save();
  return NextResponse.json({ user: s.user });
}
