import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, productVariants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireOwner } from '@/lib/session';
import { audit } from '@/lib/audit';
import { z } from 'zod';

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const a = await requireOwner();
  if (!a) return NextResponse.json({ error: 'Forbidden — only the owner can delete products' }, { status: 403 });
  const id = Number(params.id);
  await audit(a, 'product.delete', 'product', id, { via: 'admin/products DELETE (soft delete)' });
  await db.update(products).set({ isActive: false }).where(eq(products.id, id));
  return NextResponse.json({ ok: true });
}
