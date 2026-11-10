import { NextResponse } from 'next/server';
import { db } from '@/db';
import { productVariants, products, complianceRecords, complianceDocuments, productBlocks } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { requireStaff } from '@/lib/session';
import { can } from '@/lib/staff';
import { complianceIssues, PRODUCT_KINDS } from '@/lib/compliance-rules';

export const dynamic = 'force-dynamic';

// Every variant with its classification, compliance record, linked documents and open issues.
export async function GET() {
  const u = await requireStaff();
  if (!u || !can(u.role, 'compliance.view')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const vs = await db
    .select({
      id: productVariants.id, productId: productVariants.productId, sku: productVariants.sku,
      flavor: productVariants.flavor, nicotineStrength: productVariants.nicotineStrength, bottleSize: productVariants.bottleSize,
      productKind: productVariants.productKind, deviceType: productVariants.deviceType, compatibility: productVariants.compatibility,
      vgPg: productVariants.vgPg, productVgPg: products.vgPgRatio, ageRestricted: productVariants.ageRestricted,
      isActive: productVariants.isActive, stockQuantity: productVariants.stockQuantity,
      productName: products.name, brand: products.brand,
    })
    .from(productVariants)
    .leftJoin(products, eq(products.id, productVariants.productId))
    .orderBy(asc(products.name), asc(productVariants.sku));
  const recs = await db.select().from(complianceRecords);
  const docs = await db.select().from(complianceDocuments);
  const blocks = await db.select().from(productBlocks).where(eq(productBlocks.status, 'active'));
  const now = new Date();

  const variants = vs.map((v) => {
    const rec = recs.find((r) => r.variantId === v.id) ?? null;
    const myDocs = docs.filter((d) => d.variantId === v.id || (d.productId != null && d.productId === v.productId));
    const issues = complianceIssues(
      { productKind: v.productKind, nicotineStrength: v.nicotineStrength, bottleSize: v.bottleSize, name: v.productName ?? undefined },
      rec, myDocs, now,
    );
    const activeBlocks = blocks.filter((b) => (b.scope === 'variant' && b.variantId === v.id) || (b.scope === 'product' && b.productId === v.productId));
    return { ...v, record: rec, documents: myDocs, issues, blocks: activeBlocks };
  });
  return NextResponse.json({ variants, kinds: PRODUCT_KINDS });
}
