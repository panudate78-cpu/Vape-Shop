import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { categories } from '@/db/schema';
import { sql, eq, asc } from 'drizzle-orm';
import { requireAdmin, requireOwner } from '@/lib/session';
import { audit } from '@/lib/audit';
import { STANDARD_RATE_KEY, standardVatRate } from '@/lib/reports/load';

export const dynamic = 'force-dynamic';

// VAT rates used in reports and accounting exports. Owner changes them; management can read them.
export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const cats = await db.select({ id: categories.id, name: categories.name, taxRate: categories.taxRate }).from(categories).orderBy(asc(categories.name));
  return NextResponse.json({
    standardRate: await standardVatRate(),
    categories: cats.map((c) => ({ id: c.id, name: c.name, taxRate: Number(c.taxRate) })),
    note: 'Prices are entered VAT-inclusive. Confirm each rate with your accountant before relying on it.',
  });
}

const rate = z.number().min(0).max(100);
const schema = z.object({
  standardRate: rate.optional(),
  categories: z.array(z.object({ id: z.number().int().positive(), taxRate: rate })).max(500).optional(),
});

export async function PATCH(req: Request) {
  const a = await requireOwner();
  if (!a) return NextResponse.json({ error: 'Forbidden — only the owner can change VAT rates' }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Enter VAT rates between 0 and 100.' }, { status: 400 });
  const d = parsed.data;
  if (d.standardRate != null) {
    await db.execute(sql`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (${STANDARD_RATE_KEY}, ${String(d.standardRate)}, NOW(), ${a.email})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`);
    await audit(a, 'tax.standard_rate', 'setting', STANDARD_RATE_KEY, { to: d.standardRate });
  }
  for (const c of d.categories ?? []) {
    await db.update(categories).set({ taxRate: c.taxRate.toFixed(2) }).where(eq(categories.id, c.id));
  }
  if (d.categories?.length) await audit(a, 'tax.category_rates', 'category', null, { changes: d.categories });
  return NextResponse.json({ ok: true });
}
