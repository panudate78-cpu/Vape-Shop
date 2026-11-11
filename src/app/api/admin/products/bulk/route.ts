import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { products, productVariants, categories } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireOwner } from '@/lib/session';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Bulk product actions for the products list. Owner only, like archive and restore.
// archive / reactivate: same effect as the single-product buttons (product and its variants).
// set_category: moves the selected products to one existing category.
// Runs in one transaction: either every selected product changes or none does.
const schema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Select at least one product').max(500, 'Select at most 500 products at once'),
  action: z.enum(['archive', 'reactivate', 'set_category']),
  categoryId: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  const admin = await requireOwner();
  if (!admin) return NextResponse.json({ error: 'Forbidden — only the owner can change products in bulk' }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 });
  const { action, categoryId } = parsed.data;
  const ids = Array.from(new Set(parsed.data.ids));
  if (action === 'set_category' && !categoryId) return NextResponse.json({ error: 'Choose a category' }, { status: 400 });

  if (action === 'set_category') {
    const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId!)).limit(1);
    if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 400 });
  }

  const found = await db.select({ id: products.id, name: products.name, isActive: products.isActive, categoryId: products.categoryId })
    .from(products).where(inArray(products.id, ids));
  const foundIds = new Set(found.map((p) => p.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  const toChange = found.filter((p) => action === 'set_category'
    ? p.categoryId !== categoryId
    : action === 'archive' ? p.isActive : !p.isActive);
  if (!toChange.length) return NextResponse.json({ ok: true, changed: 0, missing, unchanged: found.length });

  const changeIds = toChange.map((p) => p.id);
  await db.transaction(async (tx) => {
    if (action === 'archive') {
      await tx.update(products).set({ isActive: false }).where(inArray(products.id, changeIds));
      await tx.update(productVariants).set({ isActive: false }).where(inArray(productVariants.productId, changeIds));
    } else if (action === 'reactivate') {
      await tx.update(products).set({ isActive: true }).where(inArray(products.id, changeIds));
      await tx.update(productVariants).set({ isActive: true }).where(inArray(productVariants.productId, changeIds));
    } else {
      await tx.update(products).set({ categoryId: categoryId! }).where(inArray(products.id, changeIds));
    }
  });

  await audit(admin, `product.bulk_${action}`, 'product', null, {
    count: changeIds.length, ids: changeIds.slice(0, 500), names: toChange.map((p) => p.name).slice(0, 100), categoryId: categoryId ?? null,
  });
  return NextResponse.json({ ok: true, changed: changeIds.length, missing, unchanged: found.length - changeIds.length });
}
