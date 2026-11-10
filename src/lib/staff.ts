// Staff roles, the permission matrix, till PIN lookup and manager approval.
// This is the single place that decides who may do what. Routes call can()
// or authorise(); the UI only mirrors these rules for display.
import { createHmac } from 'crypto';
import { db } from '@/db';
import { users } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export type StaffRole = 'ADMIN' | 'MANAGER' | 'CASHIER';
export const STAFF_ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'CASHIER'];
export const ROLE_LABEL: Record<string, string> = { ADMIN: 'Owner', MANAGER: 'Manager', CASHIER: 'Cashier', CUSTOMER: 'Customer' };

export type Permission =
  | 'till.sell'          // ring up sales, holds, paid in/out, open and close own cash shift
  | 'refund'             // refunds and returns
  | 'discount.over_cap'  // discounts above the cashier cap
  | 'price.change'       // base price / variant price override, imports
  | 'delete'             // delete or archive products and categories
  | 'export'             // accounting and CSV exports
  | 'cost.view'          // supplier unit costs, purchase order costs
  | 'profit.view'        // margin, gross profit, stock valuation at cost
  | 'cash.review'        // cash shift history with variances
  | 'audit.view'         // audit log
  | 'staff.manage';      // staff accounts, roles and PINs

const OWNER: StaffRole[] = ['ADMIN'];
const MANAGEMENT: StaffRole[] = ['ADMIN', 'MANAGER'];
const ALL_STAFF: StaffRole[] = ['ADMIN', 'MANAGER', 'CASHIER'];

export const PERMISSIONS: Record<Permission, StaffRole[]> = {
  'till.sell': ALL_STAFF,
  'refund': MANAGEMENT,
  'discount.over_cap': MANAGEMENT,
  'price.change': OWNER,
  'delete': OWNER,
  'export': MANAGEMENT,
  'cost.view': MANAGEMENT,
  'profit.view': OWNER,
  'cash.review': MANAGEMENT,
  'audit.view': MANAGEMENT,
  'staff.manage': OWNER,
};

export function isStaffRole(role?: string | null): role is StaffRole {
  return !!role && (STAFF_ROLES as string[]).includes(role);
}

export function can(role: string | null | undefined, perm: Permission): boolean {
  return isStaffRole(role) && PERMISSIONS[perm].includes(role);
}

// ---- Till PINs ----
// Only an HMAC of the PIN is stored, so a database leak does not expose PINs.
// The HMAC is also what makes PIN lookup a single indexed query.
function pinSecret() {
  return process.env.SESSION_PASSWORD || 'dev-only-dev-only-dev-only-dev-only-32chars!!';
}
export function pinLookupOf(pin: string): string {
  return createHmac('sha256', pinSecret()).update(`till-pin:${pin}`).digest('hex');
}
export const PIN_RE = /^\d{4,6}$/;

// Brute-force guard for PIN entry. In-memory, so it is per server instance.
const pinFails: { at: number }[] = [];
const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 5;
export function pinLocked(): boolean {
  const cutoff = Date.now() - WINDOW_MS;
  while (pinFails.length && pinFails[0].at < cutoff) pinFails.shift();
  return pinFails.length >= MAX_FAILS;
}
export function recordPinFailure() { pinFails.push({ at: Date.now() }); }
export function clearPinFailures() { pinFails.length = 0; }

export async function staffByPin(pin: string) {
  if (!PIN_RE.test(pin)) return null;
  const [u] = await db.select().from(users).where(and(eq(users.pinLookup, pinLookupOf(pin)), eq(users.active, true), inArray(users.role, STAFF_ROLES))).limit(1);
  return u ?? null;
}

// ---- Manager approval ----
// A cashier can request a refund or an over-cap discount. The sale then needs
// a manager or owner to enter their PIN, and that approval is recorded.
export type Actor = { id: number; email: string; role: string; fullName?: string | null };
export type Authorised = { ok: true; approver: Actor } | { ok: false; status: number; code: string; error: string };

export async function authorise(operator: Actor, perm: Permission, approverPin?: string | null): Promise<Authorised> {
  if (can(operator.role, perm)) return { ok: true, approver: operator };
  if (!approverPin) {
    return { ok: false, status: 403, code: 'APPROVAL_REQUIRED', error: 'Manager approval needed. A manager or owner enters their PIN.' };
  }
  if (pinLocked()) return { ok: false, status: 429, code: 'PIN_LOCKED', error: 'Too many wrong PINs. Wait a few minutes.' };
  const approver = await staffByPin(approverPin);
  if (!approver || !can(approver.role, perm)) {
    recordPinFailure();
    return { ok: false, status: 403, code: 'APPROVAL_REQUIRED', error: 'That PIN is not a manager or owner PIN.' };
  }
  clearPinFailures();
  return { ok: true, approver: { id: approver.id, email: approver.email, role: approver.role, fullName: approver.fullName } };
}

export const actorName = (a: { fullName?: string | null; email: string }) => a.fullName || a.email;
