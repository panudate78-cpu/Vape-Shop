import { NextResponse } from 'next/server';
import { db } from '@/db';
import { categories } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  slug: z.string().max(80).optional(),
  description: z.string().max(500).optional(),
});

async function requireCat(id: number) {
  const [r] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return r;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const existing = await requireCat(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const p = patchSchema.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const patch: Record<string, any> = {};
  if (p.data.name !== undefined) patch.name = p.data.name;
  if (p.data.description !== undefined) patch.description = p.data.description;
  if (p.data.slug !== undefined || p.data.name !== undefined) {
    patch.slug = (p.data.slug || slugify(p.data.name || existing.name)).slice(0, 80);
  }
  const [r] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning();
  return NextResponse.json(r);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Null products.categoryId instead of deleting with cascade (safer).
  const { products } = await import('@/db/schema');
  await db.update(products).set({ categoryId: null }).where(eq(products.categoryId, id));
  await db.delete(categories).where(eq(categories.id, id));
  return NextResponse.json({ ok: true });
}
