import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, productVariants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden — sign in as admin' }, { status: 403 });
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [existing] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await db.update(products).set({ isActive: false }).where(eq(products.id, id));
  await db.update(productVariants).set({ isActive: false }).where(eq(productVariants.productId, id));
  return NextResponse.json({ ok: true, archived: true, name: existing.name });
}

export async function PATCH(_: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden — sign in as admin' }, { status: 403 });
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await db.update(products).set({ isActive: true }).where(eq(products.id, id));
  await db.update(productVariants).set({ isActive: true }).where(eq(productVariants.productId, id));
  return NextResponse.json({ ok: true, unarchived: true });
}
