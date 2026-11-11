import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '@/lib/auth';
import { getSession } from '@/lib/session';
import { isLimited, recordFailure, clearFailures, clientIp } from '@/lib/rate-limit';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
const WINDOW_MS = 15 * 60_000;
const MAX_PER_ACCOUNT = 8;   // wrong passwords for one email
const MAX_PER_IP = 30;       // wrong passwords from one address, across accounts

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
  const { password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const acctKey = `login:acct:${email}`;
  const ipKey = `login:ip:${clientIp(req)}`;
  const tooMany = () => NextResponse.json({ error: 'Too many sign-in attempts. Wait 15 minutes and try again.' }, { status: 429 });
  if (isLimited(acctKey, MAX_PER_ACCOUNT, WINDOW_MS) || isLimited(ipKey, MAX_PER_IP, WINDOW_MS)) return tooMany();

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = u ? await verifyPassword(password, u.passwordHash) : false;
  if (!u || !ok) {
    recordFailure(acctKey, WINDOW_MS);
    recordFailure(ipKey, WINDOW_MS);
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  if (u.active === false) return NextResponse.json({ error: 'This account has been disabled. Ask the owner.' }, { status: 403 });
  clearFailures(acctKey);
  const s = await getSession();
  s.user = { id: u.id, email: u.email, role: u.role as 'CUSTOMER' | 'ADMIN' | 'MANAGER' | 'CASHIER', fullName: u.fullName ?? undefined };
  s.issuedAt = Date.now();
  await s.save();
  return NextResponse.json({ user: s.user });
}
