import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { z } from 'zod';
import { refundOrder, OrderError, REFUND_REASONS } from '@/lib/order-lifecycle';
import { audit } from '@/lib/audit';

// Full or partial refund of a paid online order. Managers and the owner only.
const schema = z.object({
  refundKey: z.string().min(8).max(64),
  lines: z.array(z.object({
    orderItemId: z.number().int().positive(),
    quantity: z.number().int().min(1),
    restock: z.boolean(),
  })).max(100),
  includeShipping: z.boolean().default(false),
  reasonCode: z.enum(Object.keys(REFUND_REASONS) as [string, ...string[]]),
  reasonNote: z.string().max(300).optional().nullable(),
  resolution: z.enum(['refund', 'exchange']).default('refund'),
  replacementOrderId: z.number().int().positive().optional().nullable(),
  method: z.enum(['original', 'cash', 'card', 'manual']).default('original'),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(params.id);
  const body = await req.json().catch(() => ({}));
  const p = schema.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Invalid refund', issues: p.error.flatten() }, { status: 400 });
  try {
    const r = await refundOrder(id, p.data, { name: admin.email, id: admin.id });
    if (!r.duplicate) {
      await audit(admin, 'refund.create', 'order', id, {
        refundId: r.refundId, amount: r.amount, reasonCode: p.data.reasonCode, reasonNote: p.data.reasonNote ?? undefined,
        lines: p.data.lines, includeShipping: p.data.includeShipping, method: p.data.method, resolution: p.data.resolution,
      });
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
}
