import { NextResponse } from 'next/server';
import { db } from '@/db';
import { suppliers, purchaseOrders } from '@/db/schema';
import { asc, eq, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const body = z.object({
  name: z.string().min(2).max(120),
  contactName: z.string().max(120).optional().nullable(),
  email: z.string().email().max(160).optional().or(z.literal('')).nullable(),
  phone: z.string().max(40).optional().nullable(),
  accountRef: z.string().max(60).optional().nullable(),
  leadTimeDays: z.number().int().min(0).max(120).optional(),
  notes: z.string().max(500).optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await db.select().from(suppliers).orderBy(asc(suppliers.name));
  const openPos = await db.select({ supplierId: purchaseOrders.supplierId, n: sql<number>`count(*)::int` })
    .from(purchaseOrders).where(sql`${purchaseOrders.status} IN ('sent','part_received')`).groupBy(purchaseOrders.supplierId);
  return NextResponse.json({ suppliers: rows.map((s) => ({ ...s, openPurchaseOrders: openPos.find((o) => o.supplierId === s.id)?.n ?? 0 })) });
}

export async function POST(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const p = body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 });
  const [s] = await db.insert(suppliers).values({ ...p.data, email: p.data.email || null } as any).returning();
  return NextResponse.json({ ok: true, supplier: s });
}

export async function PATCH(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const p = body.partial().safeParse(b);
  if (!id || !p.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const [s] = await db.update(suppliers).set({ ...p.data, email: p.data.email || null } as any).where(eq(suppliers.id, id)).returning();
  return NextResponse.json({ ok: true, supplier: s });
}
