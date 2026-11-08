import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, productVariants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { z } from 'zod';

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(params.id);
  await db.update(products).set({ isActive: false }).where(eq(products.id, id));
  return NextResponse.json({ ok: true });
}
