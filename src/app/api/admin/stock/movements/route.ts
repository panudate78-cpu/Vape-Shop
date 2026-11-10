import { NextResponse } from 'next/server';
import { db } from '@/db';
import { stockMovements, productVariants, products } from '@/db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET ?variantId=&reason=&limit= → movement history (who, when, why, how much).
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const variantId = Number(sp.get('variantId')) || undefined;
  const reason = sp.get('reason') || undefined;
  const limit = Math.min(500, Number(sp.get('limit')) || 200);
  const rows = await db.select({
    id: stockMovements.id, variantId: stockMovements.variantId, delta: stockMovements.delta,
    qtyBefore: stockMovements.qtyBefore, qtyAfter: stockMovements.qtyAfter, reason: stockMovements.reason,
    actor: stockMovements.actor, note: stockMovements.note, orderId: stockMovements.orderId,
    poId: stockMovements.poId, stocktakeId: stockMovements.stocktakeId, batchId: stockMovements.batchId,
    createdAt: stockMovements.createdAt, sku: productVariants.sku, productName: products.name,
    flavor: productVariants.flavor,
  }).from(stockMovements)
    .leftJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(and(
      variantId ? eq(stockMovements.variantId, variantId) : undefined,
      reason ? eq(stockMovements.reason, reason) : undefined,
    ))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(limit);
  return NextResponse.json({ movements: rows });
}
