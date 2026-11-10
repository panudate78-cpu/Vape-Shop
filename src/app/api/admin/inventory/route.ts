import { NextResponse } from 'next/server';
import { db } from '@/db';
import { productVariants, products } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { z } from 'zod';
import { changeStock } from '@/lib/stock';
import { audit } from '@/lib/audit';

export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await db.select({
      v: productVariants, p: { name: products.name, brand: products.brand },
    })
    .from(productVariants)
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.isActive, true))
    .orderBy(products.brand, products.name, productVariants.flavor);
  return NextResponse.json(rows.map((r) => ({ ...r.v, productName: r.p?.name, brand: r.p?.brand })));
}

const patch = z.object({
  priceOverride: z.coerce.number().nonnegative().optional(),
  stockQuantity: z.coerce.number().int().nonnegative().optional(),
  lowStockThreshold: z.coerce.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const p = patch.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Bad' }, { status: 400 });
  // Price overrides are owner-only.
  if (p.data.priceOverride !== undefined && a.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the owner can change prices.', code: 'OWNER_ONLY' }, { status: 403 });
  }
  const set: Record<string, any> = {};
  if (p.data.priceOverride !== undefined) {
    set.priceOverride = p.data.priceOverride.toFixed(2);
    await audit(a, 'price.change', 'variant', id, { priceOverride: p.data.priceOverride });
  }
  if (p.data.stockQuantity !== undefined) set.stockQuantity = p.data.stockQuantity;
  if (p.data.lowStockThreshold !== undefined) set.lowStockThreshold = p.data.lowStockThreshold;
  if (p.data.isActive !== undefined) set.isActive = p.data.isActive;
  // A typed-in stock figure is a correction: write it through the ledger so the
  // change shows in movement history with who, when and by how much.
  if (p.data.stockQuantity !== undefined) {
    const [cur] = await db.select({ s: productVariants.stockQuantity }).from(productVariants).where(eq(productVariants.id, id));
    const delta = p.data.stockQuantity - (cur?.s ?? 0);
    if (delta !== 0) {
      try {
        await changeStock({ variantId: id, delta, reason: 'correction', actor: a.email, note: 'Set from inventory grid' });
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Stock change failed' }, { status: 409 });
      }
    }
  }
  delete set.stockQuantity;
  const [v] = Object.keys(set).length
    ? await db.update(productVariants).set(set).where(eq(productVariants.id, id)).returning()
    : await db.select().from(productVariants).where(eq(productVariants.id, id));
  return NextResponse.json(v);
}
