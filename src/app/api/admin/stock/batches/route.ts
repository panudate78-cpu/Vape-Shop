import { NextResponse } from 'next/server';
import { db } from '@/db';
import { stockBatches, stockMovements, productVariants, products, orders, users } from '@/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { applyStockChange, StockError } from '@/lib/stock';
import { z } from 'zod';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET → batches (lots) with expiry status.
export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await db.select({
    id: stockBatches.id, variantId: stockBatches.variantId, batchCode: stockBatches.batchCode,
    expiryDate: stockBatches.expiryDate, qtyReceived: stockBatches.qtyReceived, qtyRemaining: stockBatches.qtyRemaining,
    unitCost: stockBatches.unitCost, recalled: stockBatches.recalled, receivedAt: stockBatches.receivedAt,
    sku: productVariants.sku, flavor: productVariants.flavor, productName: products.name,
    today: sql<string>`CURRENT_DATE::text`,
  }).from(stockBatches)
    .leftJoin(productVariants, eq(productVariants.id, stockBatches.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .orderBy(sql`${stockBatches.expiryDate} ASC NULLS LAST`, desc(stockBatches.receivedAt))
    .limit(300);
  const today = rows[0]?.today ?? new Date().toISOString().slice(0, 10);
  return NextResponse.json({
    batches: rows.map(({ today: _t, ...b }) => {
      const status = b.recalled ? 'recalled'
        : b.qtyRemaining <= 0 ? 'used'
        : !b.expiryDate ? 'no_expiry'
        : b.expiryDate < today ? 'expired'
        : (Date.parse(b.expiryDate) - Date.parse(today)) / 86_400_000 <= 60 ? 'expiring' : 'ok';
      return { ...b, status };
    }),
  });
}

const recallSchema = z.object({ batchId: z.number().int().positive(), note: z.string().min(3).max(300) });

// POST → recall a batch: removes its remaining units from stock (reason 'recall') and
// lists the orders that took units from this batch, so those customers can be contacted.
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const p = recallSchema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'Give a reason for the recall (at least 3 characters)' }, { status: 400 });
  try {
    const result = await db.transaction(async (tx) => {
      const [b] = await tx.select().from(stockBatches).where(eq(stockBatches.id, p.data.batchId)).for('update');
      if (!b) throw new StockError('Batch not found');
      if (b.recalled) throw new StockError('This batch was already recalled');
      await tx.update(stockBatches).set({ recalled: true }).where(eq(stockBatches.id, b.id));
      if (b.qtyRemaining > 0) {
        await applyStockChange(tx, {
          variantId: b.variantId, delta: -b.qtyRemaining, reason: 'recall', actor: a.email,
          note: `Recall batch ${b.batchCode}: ${p.data.note}`, batchId: b.id,
        });
      }
      return b;
    });

    const moves = await db.select({ orderId: stockMovements.orderId, delta: stockMovements.delta, at: stockMovements.createdAt })
      .from(stockMovements).where(and(eq(stockMovements.batchId, result.id), inArray(stockMovements.reason, ['sale_online', 'sale_till'])));
    const orderIds = [...new Set(moves.map((m) => m.orderId).filter((x): x is number => x != null))];
    const affected = orderIds.length ? await db.select({
      orderId: orders.id, createdAt: orders.createdAt, source: orders.source, guestEmail: orders.guestEmail, userEmail: users.email,
    }).from(orders).leftJoin(users, eq(users.id, orders.userId)).where(inArray(orders.id, orderIds)) : [];

    await audit(a, 'batch.recall', 'batch', result.id, { batchCode: result.batchCode, note: p.data.note, affectedOrders: affected.length });
    return NextResponse.json({
      ok: true, batchCode: result.batchCode,
      unitsSoldFromBatch: moves.reduce((s, m) => s - m.delta, 0),
      affectedOrders: affected.map((o) => ({ orderId: o.orderId, createdAt: o.createdAt, channel: o.source === 'pos' ? 'in-store' : 'online', email: o.guestEmail || o.userEmail || null })),
    });
  } catch (e) {
    if (e instanceof StockError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
