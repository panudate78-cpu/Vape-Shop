import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, productVariants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireOwner } from '@/lib/session';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Archiving and restoring products is owner-only.
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const admin = await requireOwner();
  if (!admin) return NextResponse.json({ error: 'Forbidden — only the owner can archive products' }, { status: 403 });
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [existing] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await db.update(products).set({ isActive: false }).where(eq(products.id, id));
  await db.update(productVariants).set({ isActive: false }).where(eq(productVariants.productId, id));
  await audit(admin, 'product.archive', 'product', id, { name: existing.name });
  return NextResponse.json({ ok: true, archived: true, name: existing.name });
}

export async function PATCH(_: Request, { params }: { params: { id: string } }) {
  const admin = await requireOwner();
  if (!admin) return NextResponse.json({ error: 'Forbidden — only the owner can restore products' }, { status: 403 });
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await db.update(products).set({ isActive: true }).where(eq(products.id, id));
  await db.update(productVariants).set({ isActive: true }).where(eq(productVariants.productId, id));
  await audit(admin, 'product.restore', 'product', id, {});
  return NextResponse.json({ ok: true, unarchived: true });
}
