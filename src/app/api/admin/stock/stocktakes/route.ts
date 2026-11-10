import { NextResponse } from 'next/server';
import { db } from '@/db';
import { stocktakes, stocktakeCounts, productVariants, products } from '@/db/schema';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { applyStockChange, StockError, rowsOf } from '@/lib/stock';
import { z } from 'zod';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Stocktakes count physical stock and post the difference as 'stock_count' movements.
//  kind 'full'    → every active variant is listed up-front; unscanned lines can be zeroed at completion.
//  kind 'partial' → only what is scanned is counted; everything else is left alone.
// Variance is computed against stock at COMPLETION time, so sales during the count are not lost.

async function resolveVariant(ref: { barcode?: string; sku?: string; variantId?: number }) {
  const cond = ref.variantId ? eq(productVariants.id, ref.variantId)
    : ref.barcode ? eq(productVariants.barcode, ref.barcode.trim())
    : ref.sku ? eq(productVariants.sku, ref.sku.trim()) : undefined;
  if (!cond) return null;
  const [v] = await db.select({ id: productVariants.id, sku: productVariants.sku, stock: productVariants.stockQuantity, flavor: productVariants.flavor, productName: products.name })
    .from(productVariants).leftJoin(products, eq(products.id, productVariants.productId)).where(cond).limit(1);
  return v ?? null;
}

export async function GET(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get('id')) || 0;
  if (!id) {
    const list = await db.select().from(stocktakes).orderBy(desc(stocktakes.startedAt)).limit(30);
    return NextResponse.json({ stocktakes: list });
  }
  const [st] = await db.select().from(stocktakes).where(eq(stocktakes.id, id));
  if (!st) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const lines = await db.select({
    variantId: stocktakeCounts.variantId, expected: stocktakeCounts.expectedQty, counted: stocktakeCounts.countedQty,
    current: productVariants.stockQuantity, sku: productVariants.sku, barcode: productVariants.barcode,
    flavor: productVariants.flavor, productName: products.name,
  }).from(stocktakeCounts)
    .leftJoin(productVariants, eq(productVariants.id, stocktakeCounts.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(eq(stocktakeCounts.stocktakeId, id))
    .orderBy(desc(stocktakeCounts.updatedAt));
  return NextResponse.json({ stocktake: st, lines });
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), name: z.string().min(2).max(80), kind: z.enum(['full', 'partial']) }),
  z.object({ action: z.literal('scan'), id: z.number().int().positive(), barcode: z.string().optional(), sku: z.string().optional(), variantId: z.number().int().optional(), qty: z.number().int().min(1).max(999).optional().default(1) }),
  z.object({ action: z.literal('set'), id: z.number().int().positive(), variantId: z.number().int().positive(), counted: z.number().int().min(0) }),
  z.object({ action: z.literal('complete'), id: z.number().int().positive(), zeroUnscanned: z.boolean().optional().default(false) }),
]);

export async function POST(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  if (body.action === 'start') {
    const [st] = await db.insert(stocktakes).values({ name: body.name, kind: body.kind, status: 'open', startedBy: a.email }).returning();
    if (body.kind === 'full') {
      const vars = await db.select({ id: productVariants.id, stock: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.isActive, true));
      for (let i = 0; i < vars.length; i += 200) {
        await db.insert(stocktakeCounts).values(vars.slice(i, i + 200).map((v) => ({ stocktakeId: st.id, variantId: v.id, expectedQty: v.stock, countedQty: null })));
      }
    }
    return NextResponse.json({ ok: true, stocktake: st });
  }

  // Everything below works on an open stocktake.
  const [st] = await db.select().from(stocktakes).where(eq(stocktakes.id, body.id));
  if (!st) return NextResponse.json({ error: 'Stocktake not found' }, { status: 404 });
  if (st.status !== 'open') return NextResponse.json({ error: 'This stocktake is already completed' }, { status: 409 });

  if (body.action === 'scan') {
    const v = await resolveVariant({ barcode: body.barcode, sku: body.sku, variantId: body.variantId });
    if (!v) return NextResponse.json({ error: `No product for barcode/SKU "${body.barcode || body.sku || body.variantId}"` }, { status: 404 });
    const [line] = await db.insert(stocktakeCounts).values({
      stocktakeId: st.id, variantId: v.id, expectedQty: v.stock, countedQty: body.qty,
    }).onConflictDoUpdate({
      target: [stocktakeCounts.stocktakeId, stocktakeCounts.variantId],
      set: { countedQty: sql`COALESCE(${stocktakeCounts.countedQty}, 0) + ${body.qty}`, updatedAt: new Date() },
    }).returning();
    return NextResponse.json({ ok: true, line: { variantId: v.id, sku: v.sku, name: `${v.productName ?? ''} ${v.flavor ?? ''}`.trim(), counted: line.countedQty, expected: line.expectedQty, current: v.stock } });
  }

  if (body.action === 'set') {
    await db.insert(stocktakeCounts).values({ stocktakeId: st.id, variantId: body.variantId, expectedQty: 0, countedQty: body.counted })
      .onConflictDoUpdate({ target: [stocktakeCounts.stocktakeId, stocktakeCounts.variantId], set: { countedQty: body.counted, updatedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  // complete
  try {
    const result = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(stocktakes).where(eq(stocktakes.id, st.id)).for('update');
      if (locked.status !== 'open') throw new StockError('This stocktake is already completed');
      if (body.zeroUnscanned && st.kind === 'full') {
        await tx.update(stocktakeCounts).set({ countedQty: 0 }).where(and(eq(stocktakeCounts.stocktakeId, st.id), isNull(stocktakeCounts.countedQty)));
      }
      const lines = await tx.select().from(stocktakeCounts).where(and(eq(stocktakeCounts.stocktakeId, st.id), sql`${stocktakeCounts.countedQty} IS NOT NULL`));
      const variance: { variantId: number; sku: string; expected: number; counted: number; delta: number }[] = [];
      for (const l of lines) {
        const [cur] = rowsOf(await tx.execute(sql`SELECT stock_quantity AS s, sku FROM product_variants WHERE id = ${l.variantId}`));
        const delta = Number(l.countedQty) - Number(cur.s);
        if (delta !== 0) {
          try {
            await applyStockChange(tx, {
              variantId: l.variantId, delta, reason: 'stock_count', actor: a.email, stocktakeId: st.id,
              note: `Stocktake: ${st.name}`, refKey: `stocktake:${st.id}:${l.variantId}`,
            });
          } catch (e: any) {
            throw new StockError(`${cur.sku}: ${e.message}`);
          }
        }
        variance.push({ variantId: l.variantId, sku: cur.sku, expected: l.expectedQty, counted: Number(l.countedQty), delta });
      }
      await tx.update(stocktakes).set({ status: 'completed', completedBy: a.email, completedAt: new Date() }).where(eq(stocktakes.id, st.id));
      return variance;
    });
    await audit(a, 'stocktake.complete', 'stocktake', st.id, { name: st.name, kind: st.kind, zeroUnscanned: body.zeroUnscanned, adjusted: result.filter((r) => r.delta !== 0).length, netUnits: result.reduce((t, r) => t + r.delta, 0) });
    return NextResponse.json({ ok: true, variance: result, adjusted: result.filter((r) => r.delta !== 0).length });
  } catch (e) {
    if (e instanceof StockError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
