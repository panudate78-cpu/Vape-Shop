import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { getSession } from '@/lib/session';

// Maintenance mode: when on, customers see a maintenance page and cannot check out.
// Staff (owner, manager, cashier) keep full access. Stored in app_settings.
export const MAINTENANCE_KEY = 'maintenance_mode';
export const STAFF_ROLES = ['ADMIN', 'MANAGER', 'CASHIER'];

export type MaintenanceState = { enabled: boolean; updatedAt: string | null; updatedBy: string | null };

export async function readMaintenance(): Promise<MaintenanceState> {
  try {
    const rows: any = await db.execute(sql`SELECT value, updated_at, updated_by FROM app_settings WHERE key = ${MAINTENANCE_KEY} LIMIT 1`);
    const r = (rows.rows ?? rows)[0];
    return {
      enabled: r?.value === 'on',
      updatedAt: r?.updated_at ? new Date(r.updated_at).toISOString() : null,
      updatedBy: r?.updated_by ?? null,
    };
  } catch {
    // If the setting cannot be read, the site stays open rather than showing a false maintenance page.
    return { enabled: false, updatedAt: null, updatedBy: null };
  }
}

export async function isStaffSession(): Promise<boolean> {
  const s = await getSession();
  return !!s.user && STAFF_ROLES.includes(s.user.role);
}

/** True when this request should be refused because the shop is in maintenance mode (customers only). */
export async function blocksShoppers(): Promise<boolean> {
  if (await isStaffSession()) return false;
  return (await readMaintenance()).enabled;
}
