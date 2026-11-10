import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, ne, and, sql, inArray } from 'drizzle-orm';
import { requireOwner } from '@/lib/session';
import { hashPassword } from '@/lib/auth';
import { STAFF_ROLES, PIN_RE, pinLookupOf } from '@/lib/staff';
import { audit } from '@/lib/audit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Staff accounts: owner only. Owner = ADMIN, Manager, Cashier.
export async function GET() {
  const a = await requireOwner();
  if (!a) return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 });
  const rows = await db.select({
    id: users.id, email: users.email, fullName: users.fullName, role: users.role, active: users.active,
    hasPin: sql<boolean>`${users.pinLookup} IS NOT NULL`, createdAt: users.createdAt,
  }).from(users).where(inArray(users.role, ['ADMIN', 'MANAGER', 'CASHIER'])).orderBy(users.role, users.fullName);
  return NextResponse.json({ staff: rows });
}

const pinField = z.string().regex(PIN_RE, 'PIN must be 4–6 digits');
const createSchema = z.object({
  email: z.string().email().max(160),
  fullName: z.string().min(2).max(120),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER']),
  password: z.string().min(8).max(200),
  pin: pinField.optional(),
});

export async function POST(req: Request) {
  const a = await requireOwner();
  if (!a) return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid details' }, { status: 400 });
  const d = parsed.data;
  const email = d.email.toLowerCase();
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (exists) return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 });
  const pinLookup = d.pin ? pinLookupOf(d.pin) : null;
  if (pinLookup) {
    const [pinTaken] = await db.select({ id: users.id }).from(users).where(eq(users.pinLookup, pinLookup)).limit(1);
    if (pinTaken) return NextResponse.json({ error: 'That PIN is already used by another staff member' }, { status: 409 });
  }
  const [u] = await db.insert(users).values({
    email, fullName: d.fullName.trim(), role: d.role, passwordHash: await hashPassword(d.password),
    active: true, pinLookup,
  } as any).returning({ id: users.id, email: users.email, role: users.role });
  await audit(a, 'staff.create', 'user', u.id, { email, role: d.role, hasPin: !!pinLookup });
  return NextResponse.json({ ok: true, id: u.id });
}

const patchSchema = z.object({
  id: z.number().int().positive(),
  fullName: z.string().min(2).max(120).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
  pin: pinField.optional(),
  clearPin: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const a = await requireOwner();
  if (!a) return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid details' }, { status: 400 });
  const d = parsed.data;
  const [target] = await db.select().from(users).where(and(eq(users.id, d.id), ne(users.role, 'CUSTOMER'))).limit(1);
  if (!target) return NextResponse.json({ error: 'Staff account not found' }, { status: 404 });

  // Never leave the business without an active owner (including by yourself).
  const losesOwner = target.role === 'ADMIN' && (d.active === false || (d.role && d.role !== 'ADMIN'));
  if (losesOwner) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users)
      .where(and(eq(users.role, 'ADMIN'), eq(users.active, true), ne(users.id, target.id)));
    if (!n) return NextResponse.json({ error: 'You cannot demote or disable the last active owner.' }, { status: 409 });
  }

  const set: Record<string, any> = {};
  const changes: Record<string, unknown> = {};
  if (d.fullName !== undefined && d.fullName !== target.fullName) { set.fullName = d.fullName.trim(); changes.fullName = d.fullName.trim(); }
  if (d.role !== undefined && d.role !== target.role) { set.role = d.role; changes.role = { from: target.role, to: d.role }; }
  if (d.active !== undefined && d.active !== target.active) { set.active = d.active; changes.active = { from: target.active, to: d.active }; }
  if (d.password) { set.passwordHash = await hashPassword(d.password); changes.passwordReset = true; }
  if (d.clearPin) { set.pinLookup = null; changes.pinCleared = true; }
  if (d.pin) {
    const lookup = pinLookupOf(d.pin);
    const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.pinLookup, lookup), ne(users.id, target.id))).limit(1);
    if (taken) return NextResponse.json({ error: 'That PIN is already used by another staff member' }, { status: 409 });
    set.pinLookup = lookup; changes.pinSet = true;
  }
  if (!Object.keys(set).length) return NextResponse.json({ ok: true, unchanged: true });
  await db.update(users).set(set).where(eq(users.id, target.id));
  await audit(a, 'staff.update', 'user', target.id, { email: target.email, changes });
  return NextResponse.json({ ok: true });
}
