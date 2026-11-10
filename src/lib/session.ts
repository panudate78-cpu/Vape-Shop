import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

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
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD || 'dev-only-dev-only-dev-only-dev-only-32chars!!',
  cookieName: 'drcloud_session',
  cookieOptions: { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', httpOnly: true },
};

export async function getSession() {
  const s = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (!s.cart) s.cart = [];
  return s;
}

export async function requireUser() {
  const s = await getSession();
  if (!s.user) return null;
  return s.user;
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
