import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';

// CUSTOMER = shopper. Staff: ADMIN = owner, MANAGER, CASHIER (see lib/staff.ts).
export type SessionUser = {
  id: number;
  email: string;
  role: 'CUSTOMER' | 'ADMIN' | 'MANAGER' | 'CASHIER';
  fullName?: string;
};
export type CartLine = { variantId: number; quantity: number };
export type SessionData = {
  user?: SessionUser;
  cart: CartLine[];
  issuedAt?: number;          // when the current user signed in (ms); staff sessions expire from this
  pendingOrderIds?: number[]; // orders this browser created; only they may be paid from this session
};

const DEV_SECRET = 'dev-only-dev-only-dev-only-dev-only-32chars!!';

// Production refuses to run with a missing or short secret, so sessions and staff PINs cannot be forged with a known default.
export function sessionSecret(): string {
  const v = process.env.SESSION_PASSWORD;
  if (process.env.NODE_ENV === 'production') {
    if (!v || v.length < 32) throw new Error('SESSION_PASSWORD must be set to at least 32 characters in production.');
    return v;
  }
  return v || DEV_SECRET;
}

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;   // customers: stay signed in for 30 days
export const STAFF_SESSION_MAX_MS = 12 * 60 * 60 * 1000; // staff: sign in again after 12 hours

export function sessionOptions(): SessionOptions {
  return {
    password: sessionSecret(),
    cookieName: 'drcloud_session',
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', httpOnly: true, maxAge: SESSION_TTL_SECONDS },
  };
}

export async function getSession() {
  const s = await getIronSession<SessionData>(cookies(), sessionOptions());
  if (!s.cart) s.cart = [];
  return s;
}

// Who is signed in right now. Checked against the database on every call:
// a deactivated account is signed out at once, and a changed role takes effect immediately.
export async function requireUser(): Promise<SessionUser | null> {
  const s = await getSession();
  if (!s.user) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, role: users.role, fullName: users.fullName, active: users.active })
    .from(users).where(eq(users.id, s.user.id)).limit(1);
  const isStaff = !!row && row.role !== 'CUSTOMER';
  const expired = isStaff && (!s.issuedAt || Date.now() - s.issuedAt > STAFF_SESSION_MAX_MS);
  if (!row || row.active === false || expired) {
    await trySave(s, () => { s.user = undefined; s.issuedAt = undefined; });
    return null;
  }
  if (row.role !== s.user.role) await trySave(s, () => { s.user = { ...s.user!, role: row.role as SessionUser['role'] }; });
  return { id: row.id, email: row.email, role: row.role as SessionUser['role'], fullName: row.fullName ?? undefined };
}

// Server components cannot write cookies; route handlers can. Failing to save only skips the refresh.
async function trySave(s: Awaited<ReturnType<typeof getSession>>, change: () => void) {
  change();
  try { await s.save(); } catch { /* read-only context */ }
}

// Back office (owner + manager).
export async function requireAdmin() {
  const u = await requireUser();
  if (!u || (u.role !== 'ADMIN' && u.role !== 'MANAGER')) return null;
  return u;
}

// Owner only.
export async function requireOwner() {
  const u = await requireUser();
  if (!u || u.role !== 'ADMIN') return null;
  return u;
}

// Till: any staff account (owner, manager or cashier).
export async function requireStaff() {
  const u = await requireUser();
  if (!u || (u.role !== 'ADMIN' && u.role !== 'MANAGER' && u.role !== 'CASHIER')) return null;
  return u;
}
