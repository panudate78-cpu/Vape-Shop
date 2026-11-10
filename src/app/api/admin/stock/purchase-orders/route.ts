import { NextResponse } from 'next/server';
import { db } from '@/db';
import { purchaseOrders, purchaseOrderLines, suppliers, productVariants, products } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { applyStockChange, StockError, changeStock } from '@/lib/stock';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// GET            → purchase orders (list)
// GET ?id=       → one PO with lines, received and outstanding quantities
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get('id')) || 0;
  if (!id) {
    const list = await db.select({
      id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, status: purchaseOrders.status,
      expectedAt: purchaseOrders.expectedAt, createdAt: purchaseOrders.createdAt, supplierName: suppliers.name,
      supplierId: purchaseOrders.supplierId,
    }).from(purchaseOrders).leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .orderBy(desc(purchaseOrders.createdAt)).limit(100);
    return NextResponse.json({ purchaseOrders: list });
  }
  const [po] = await db.select({ po: purchaseOrders, supplierName: suppliers.name, leadTime: suppliers.leadTimeDays })
    .from(purchaseOrders).leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId)).where(eq(purchaseOrders.id, id));
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const lines = await db.select({
    id: purchaseOrderLines.id, variantId: purchaseOrderLines.variantId, ordered: purchaseOrderLines.quantityOrdered,
    received: purchaseOrderLines.quantityReceived, unitCost: purchaseOrderLines.unitCost,
    sku: productVariants.sku, barcode: productVariants.barcode, flavor: productVariants.flavor, productName: products.name,
  }).from(purchaseOrderLines)
    .leftJoin(productVariants, eq(productVariants.id, purchaseOrderLines.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(eq(purchaseOrderLines.poId, id));
  return NextResponse.json({
    purchaseOrder: { ...po.po, supplierName: po.supplierName, leadTime: po.leadTime },
    lines: lines.map((l) => ({ ...l, outstanding: Math.max(0, l.ordered - l.received), lineTotal: Math.round(l.ordered * Number(l.unitCost) * 100) / 100 })),
  });
}

const createSchema = z.object({
  action: z.literal('create'),
  supplierId: z.number().int().positive(),
  expectedAt: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(z.object({ variantId: z.number().int().positive(), quantity: z.number().int().positive(), unitCost: z.number().min(0).optional() })).min(1),
});
const actionSchema = z.discriminatedUnion('action', [
  createSchema,
  z.object({ action: z.literal('send'), id: z.number().int().positive() }),
  z.object({ action: z.literal('cancel'), id: z.number().int().positive() }),
  z.object({
    action: z.literal('receive'), id: z.number().int().positive(),
    receiptKey: z.string().min(6).max(64), // client-generated: a double-submitted receipt applies once
    lines: z.array(z.object({
      lineId: z.number().int().positive(), quantity: z.number().int().positive(),
      batchCode: z.string().max(60).optional().nullable(), expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    })).min(1),
  }),
]);

export async function POST(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const p = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'Invalid request', issues: p.error.flatten() }, { status: 400 });
  const b = p.data;

  if (b.action === 'create') {
    const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const vars = await db.select({ id: productVariants.id, uc: productVariants.unitCost, pc: products.costPrice })
      .from(productVariants).leftJoin(products, eq(products.id, productVariants.productId));
    const [po] = await db.insert(purchaseOrders).values({
      poNumber, supplierId: b.supplierId, status: 'draft', expectedAt: b.expectedAt ? new Date(b.expectedAt) : null,
      notes: b.notes || null, createdBy: a.email,
    }).returning();
    await db.insert(purchaseOrderLines).values(b.lines.map((l) => {
      const v = vars.find((x) => x.id === l.variantId);
      const cost = l.unitCost ?? (v?.uc != null ? Number(v.uc) : Number(v?.pc ?? 0));
      return { poId: po.id, variantId: l.variantId, quantityOrdered: l.quantity, quantityReceived: 0, unitCost: cost.toFixed(2) };
    }));
    return NextResponse.json({ ok: true, purchaseOrder: po });
  }

  if (b.action === 'send' || b.action === 'cancel') {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, b.id));
    if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (b.action === 'send') {
      if (po.status !== 'draft') return NextResponse.json({ error: 'Only draft orders can be sent' }, { status: 409 });
      await db.update(purchaseOrders).set({ status: 'sent', sentAt: new Date() }).where(eq(purchaseOrders.id, b.id));
    } else {
      const [rec] = await db.select({ n: sql<number>`coalesce(sum(${purchaseOrderLines.quantityReceived}),0)::int` })
        .from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, b.id));
      if (rec.n > 0) return NextResponse.json({ error: 'Some items were already received — close the rest instead of cancelling' }, { status: 409 });
      await db.update(purchaseOrders).set({ status: 'cancelled' }).where(eq(purchaseOrders.id, b.id));
    }
    return NextResponse.json({ ok: true });
  }

  // receive (partial deliveries supported: each call records what actually arrived)
  try {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, b.id));
    if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!['sent', 'part_received'].includes(po.status)) return NextResponse.json({ error: 'Send the order before receiving stock' }, { status: 409 });

    await db.transaction(async (tx) => {
      const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, b.id));
      for (const rl of b.lines) {
        const line = lines.find((l) => l.id === rl.lineId);
        if (!line) throw new StockError(`Line ${rl.lineId} is not on this purchase order`);
        const outstanding = line.quantityOrdered - line.quantityReceived;
        if (rl.quantity > outstanding) throw new StockError(`Received ${rl.quantity} but only ${outstanding} outstanding on line ${line.id}`);
        const r = await applyStockChange(tx, {
          variantId: line.variantId, delta: rl.quantity, reason: 'delivery', actor: a.email, poId: b.id,
          note: `Delivery against ${po.poNumber}`, refKey: `po:${b.id}:${b.receiptKey}:${line.id}`,
          batchCode: rl.batchCode || `${po.poNumber}-${line.variantId}`, expiryDate: rl.expiryDate || null,
          unitCost: Number(line.unitCost),
        });
        if (r.skipped) continue; // this receipt was already applied
        await tx.update(purchaseOrderLines).set({ quantityReceived: line.quantityReceived + rl.quantity }).where(eq(purchaseOrderLines.id, line.id));
        await tx.update(productVariants).set({ unitCost: Number(line.unitCost).toFixed(2) }).where(eq(productVariants.id, line.variantId));
      }
      const after = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, b.id));
      const complete = after.every((l) => l.quantityReceived >= l.quantityOrdered);
      const anyIn = after.some((l) => l.quantityReceived > 0);
      await tx.update(purchaseOrders).set({ status: complete ? 'received' : anyIn ? 'part_received' : po.status }).where(eq(purchaseOrders.id, b.id));
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof StockError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
