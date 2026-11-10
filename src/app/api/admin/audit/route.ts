import { NextResponse } from 'next/server';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Owner and manager. Read-only: there is deliberately no way to edit or delete audit rows.
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const action = url.searchParams.get('action')?.trim();
  const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit')) || 150));
  const q = db.select().from(auditLog);
  const rows = await (action ? q.where(eq(auditLog.action, action)) : q).orderBy(desc(auditLog.at)).limit(limit);
  return NextResponse.json({ entries: rows });
}
