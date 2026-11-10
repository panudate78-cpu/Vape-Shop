// Audit trail for important actions. Written after the action succeeds.
// A failure to write is logged, not thrown, so it can't block a sale.
import { db } from '@/db';
import { auditLog } from '@/db/schema';

export type AuditActor = { id?: number | null; email?: string | null; fullName?: string | null; role?: string | null };

export async function audit(
  actor: AuditActor | null,
  action: string,
  entity: string | null,
  entityId: string | number | null,
  detail: Record<string, unknown> = {},
  registerId?: string | null,
) {
  try {
    await db.insert(auditLog).values({
      actorUserId: actor?.id ?? null,
      actorName: actor ? (actor.fullName || actor.email || null) : 'system',
      actorRole: actor?.role ?? null,
      registerId: registerId ?? null,
      action,
      entity,
      entityId: entityId == null ? null : String(entityId),
      detail: detail as any,
    });
  } catch (e) {
    console.error('[audit] could not write', action, e);
  }
}
