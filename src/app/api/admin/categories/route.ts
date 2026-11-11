import { NextResponse } from 'next/server';
import { db } from '@/db';
import { categories } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const createSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().max(80).optional(),
  description: z.string().max(500).optional(),
});

export async function GET() {
  // Storefront uses the public /api/categories. This admin listing is for staff only.
  const { requireAdmin } = await import('@/lib/session');
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await db.select().from(categories).orderBy(categories.name);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const p = createSchema.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Invalid', issues: p.error.flatten() }, { status: 400 });
  const slug = (p.data.slug || slugify(p.data.name)).slice(0, 80);
  const [r] = await db
    .insert(categories)
    .values({ name: p.data.name, slug, description: p.data.description || '' })
    .onConflictDoNothing()
    .returning();
  if (!r) return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
  return NextResponse.json(r, { status: 201 });
}
