import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, users, orderEvents, orderRefunds, orderRefundLines } from '@/db/schema';
import { eq, desc, sql, inArray } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { z } from 'zod';
import { updateFulfilment, OrderError } from '@/lib/order-lifecycle';
import { notificationsFor } from '@/lib/order-events';
import { audit } from '@/lib/audit';

// Payment status is changed only by payments and refunds, so it is not accepted here.
const patch = z.object({
  status: z.enum(['processing', 'ready', 'shipped', 'collected', 'cancelled']).optional(),
  fulfilmentStatus: z.enum(['processing', 'ready', 'shipped', 'delivered', 'collected', 'cancelled']).optional(),
  trackingNumber: z.string().max(64).optional().nullable(),
  carrier: z.string().max(64).optional().nullable(),
  collectedBy: z.string().max(120).optional().nullable(),
  idChecked: z.boolean().optional(),
  note: z.string().max(300).optional().nullable(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(params.id);
  const [row] = await db
    .select({ order: orders, userEmail: users.email, userFullName: users.fullName })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const refunds = await db.select().from(orderRefunds).where(eq(orderRefunds.orderId, id)).orderBy(desc(orderRefunds.createdAt));
  const refundLines = refunds.length
    ? await db.select().from(orderRefundLines).where(inArray(orderRefundLines.refundId, refunds.map((r) => r.id)))
    : [];
  const refundedByItem: Record<number, number> = {};
  for (const l of refundLines) refundedByItem[l.orderItemId] = (refundedByItem[l.orderItemId] ?? 0) + l.quantity;
  const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(desc(orderEvents.at), desc(orderEvents.id));
  const notes = await notificationsFor(id);

  return NextResponse.json({
    order: {
      ...row.order,
      customerEmail: row.order.guestEmail || row.userEmail || null,
      customerName: row.userFullName || null,
    },
    items: items.map((i) => ({ ...i, refundedQuantity: refundedByItem[i.id] ?? 0 })),
    refunds: refunds.map((r) => ({ ...r, lines: refundLines.filter((l) => l.refundId === r.id) })),
    events,
    notifications: notes,
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(params.id);
  const body = await req.json().catch(() => ({}));
  const p = patch.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Invalid update', issues: p.error.flatten() }, { status: 400 });
  const d = p.data;
  const to = (d.fulfilmentStatus ?? d.status) as any;
  try {
    const r = await updateFulfilment(id, {
      to,
      trackingNumber: d.trackingNumber,
      carrier: d.carrier,
      collectedBy: d.collectedBy,
      idChecked: d.idChecked,
      note: d.note,
    }, admin.email);
    await audit(admin, r.from !== r.to ? 'fulfilment.change' : 'fulfilment.update', 'order', id, { from: r.from, to: r.to, trackingNumber: d.trackingNumber, collectedBy: d.collectedBy });
    return NextResponse.json({ ok: true, fulfilmentStatus: r.to });
  } catch (e: any) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
}
