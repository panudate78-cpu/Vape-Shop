import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { complianceDocuments, productVariants, products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireStaff } from '@/lib/session';
import { can } from '@/lib/staff';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Links a supplier document (MHRA notification, safety data sheet, test report, label proof, invoice).
// The file itself stays in the supplier's or the shop's own storage. Uploads here would not persist on Vercel.
const schema = z.object({
  variantId: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  supplierName: z.string().max(120).optional(),
  kind: z.enum(['mhra_notification', 'safety_data_sheet', 'test_report', 'label_proof', 'supplier_invoice', 'other']),
  title: z.string().min(2).max(120),
  url: z.string().url().max(500).refine((u) => /^https:\/\//i.test(u), 'Use an https:// link'),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: Request) {
  const u = await requireStaff();
  if (!u || !can(u.role, 'compliance.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'Invalid document', issues: p.error.flatten() }, { status: 400 });
  const d = p.data;
  if (!d.variantId && !d.productId) return NextResponse.json({ error: 'Link the document to a variant or product' }, { status: 400 });
  if (d.variantId && !(await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.id, d.variantId)).limit(1)).length) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
  }
  if (d.productId && !(await db.select({ id: products.id }).from(products).where(eq(products.id, d.productId)).limit(1)).length) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }
  const [row] = await db.insert(complianceDocuments).values({
    variantId: d.variantId ?? null, productId: d.productId ?? null, supplierName: d.supplierName?.trim() || null,
    kind: d.kind, title: d.title.trim(), url: d.url, uploadedBy: u.fullName || u.email,
    expiresAt: d.expiresAt ? new Date(d.expiresAt + 'T23:59:59') : null,
  }).returning();
  await audit(u, 'compliance.document', d.variantId ? 'variant' : 'product', d.variantId ?? d.productId ?? null, { kind: d.kind, title: d.title });
  return NextResponse.json({ ok: true, document: row });
}
