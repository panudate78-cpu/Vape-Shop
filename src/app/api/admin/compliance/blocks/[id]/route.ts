import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { productBlocks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireStaff } from '@/lib/session';
import { can } from '@/lib/staff';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Lifting a block or recall records who lifted it and why. The record is kept.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const u = await requireStaff();
  if (!u || !can(u.role, 'compliance.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const p = z.object({ action: z.literal('lift'), reason: z.string().trim().min(5).max(300) }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'Give a reason for lifting the block' }, { status: 400 });
  const id = Number(params.id);
  const [b] = await db.select().from(productBlocks).where(eq(productBlocks.id, id)).limit(1);
  if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (b.status !== 'active') return NextResponse.json({ error: 'Already lifted' }, { status: 409 });
  await db.update(productBlocks).set({
    status: 'lifted', liftedBy: u.fullName || u.email, liftedAt: new Date(), liftReason: p.data.reason,
  }).where(eq(productBlocks.id, id));
  await audit(u, 'compliance.block_lifted', b.scope, b.scope === 'variant' ? b.variantId : b.productId, { blockId: id, reason: p.data.reason });
  return NextResponse.json({ ok: true });
}
