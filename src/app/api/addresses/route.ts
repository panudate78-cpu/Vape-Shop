import { NextResponse } from 'next/server';
import { db } from '@/db';
import { addresses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireUser } from '@/lib/session';
import { z } from 'zod';

const schema = z.object({
  label: z.string().optional().default('Home'),
  line1: z.string().min(2), line2: z.string().optional().default(''),
  city: z.string().min(2), postcode: z.string().min(3), county: z.string().optional().default(''),
  isDefault: z.boolean().optional().default(false),
});
export async function GET() {
  const u = await requireUser();
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await db.select().from(addresses).where(eq(addresses.userId, u.id));
  return NextResponse.json(rows);
}
export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const p = schema.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Bad' }, { status: 400 });
  const [a] = await db.insert(addresses).values({ userId: u.id, ...p.data }).returning();
  return NextResponse.json(a);
}
