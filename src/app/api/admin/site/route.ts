import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { requireAdmin, requireOwner } from '@/lib/session';
import { audit } from '@/lib/audit';
import { MAINTENANCE_KEY, readMaintenance } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

// GET → current maintenance state (any admin or manager can see it).
export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await readMaintenance());
}

const schema = z.object({ enabled: z.boolean() });

// PUT → turn maintenance mode on or off. Owner only, because it takes the public site down.
export async function PUT(req: Request) {
  const a = await requireOwner();
  if (!a) return NextResponse.json({ error: 'Forbidden — only the owner can change maintenance mode' }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Send {"enabled": true} or {"enabled": false}.' }, { status: 400 });
  const value = parsed.data.enabled ? 'on' : 'off';
  try {
    await db.execute(sql`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (${MAINTENANCE_KEY}, ${value}, NOW(), ${a.email})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`);
    await audit(a, value === 'on' ? 'site.maintenance_on' : 'site.maintenance_off', 'setting', MAINTENANCE_KEY, { enabled: parsed.data.enabled });
  } catch (e: any) {
    console.error('[site] maintenance update failed:', e);
    return NextResponse.json({ error: 'Could not change maintenance mode. Nothing was changed. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(await readMaintenance()) });
}
