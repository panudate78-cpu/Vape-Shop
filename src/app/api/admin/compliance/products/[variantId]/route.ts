import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { productVariants, complianceRecords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireStaff } from '@/lib/session';
import { can } from '@/lib/staff';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const kinds = ['device', 'replacement_pod', 'coil', 'liquid', 'accessory', 'disposable', 'unclassified'] as const;
const body = z.object({
  productKind: z.enum(kinds).optional(),
  deviceType: z.string().max(80).optional(),
  compatibility: z.string().max(200).optional(),
  vgPg: z.string().max(20).nullable().optional(),
  ageRestricted: z.boolean().optional(),
  record: z.object({
    mhraNotificationRef: z.string().max(60).nullable().optional(),
    batchNumber: z.string().max(60).nullable().optional(),
    nicotineMgMl: z.number().min(0).max(200).nullable().optional(),
    bottleMl: z.number().min(0).max(1000).nullable().optional(),
    tankMl: z.number().min(0).max(1000).nullable().optional(),
    childResistant: z.boolean().optional(),
    tamperEvident: z.boolean().optional(),
    labelChecked: z.boolean().optional(),          // stamps the label check with the staff name and time
    supplierName: z.string().max(120).nullable().optional(),
    notes: z.string().max(500).optional(),
  }).optional(),
});

// Updates classification and the compliance record. Records facts; a stored violation stops sales.
export async function PUT(req: Request, { params }: { params: { variantId: string } }) {
  const u = await requireStaff();
  if (!u || !can(u.role, 'compliance.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const variantId = Number(params.variantId);
  const p = body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'Invalid details', issues: p.error.flatten() }, { status: 400 });
  const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
  if (!v) return NextResponse.json({ error: 'Variant not found' }, { status: 404 });

  const d = p.data;
  const vPatch: Record<string, unknown> = {};
  if (d.productKind !== undefined) vPatch.productKind = d.productKind;
  if (d.deviceType !== undefined) vPatch.deviceType = d.deviceType.trim();
  if (d.compatibility !== undefined) vPatch.compatibility = d.compatibility.trim();
  if (d.vgPg !== undefined) vPatch.vgPg = d.vgPg?.trim() || null;
  if (d.ageRestricted !== undefined) vPatch.ageRestricted = d.ageRestricted;
  if (Object.keys(vPatch).length) await db.update(productVariants).set(vPatch).where(eq(productVariants.id, variantId));

  if (d.record) {
    const r = d.record;
    const [existing] = await db.select().from(complianceRecords).where(eq(complianceRecords.variantId, variantId)).limit(1);
    const f: Record<string, unknown> = { updatedAt: new Date(), updatedBy: u.fullName || u.email };
    const str = (x: string | null | undefined) => (x === undefined ? undefined : x?.trim() || null);
    if (r.mhraNotificationRef !== undefined) f.mhraNotificationRef = str(r.mhraNotificationRef);
    if (r.batchNumber !== undefined) f.batchNumber = str(r.batchNumber);
    if (r.nicotineMgMl !== undefined) f.nicotineMgMl = r.nicotineMgMl === null ? null : String(r.nicotineMgMl);
    if (r.bottleMl !== undefined) f.bottleMl = r.bottleMl === null ? null : String(r.bottleMl);
    if (r.tankMl !== undefined) f.tankMl = r.tankMl === null ? null : String(r.tankMl);
    if (r.childResistant !== undefined) f.childResistant = r.childResistant;
    if (r.tamperEvident !== undefined) f.tamperEvident = r.tamperEvident;
    if (r.supplierName !== undefined) f.supplierName = str(r.supplierName);
    if (r.notes !== undefined) f.notes = r.notes.trim();
    if (r.labelChecked) { f.labelCheckedAt = new Date(); f.labelCheckedBy = u.fullName || u.email; }
    if (existing) await db.update(complianceRecords).set(f).where(eq(complianceRecords.variantId, variantId));
    else await db.insert(complianceRecords).values({ variantId, ...f } as any);
  }

  await audit(u, 'compliance.update', 'variant', variantId, { ...d, record: d.record ? { ...d.record } : undefined });
  return NextResponse.json({ ok: true });
}
