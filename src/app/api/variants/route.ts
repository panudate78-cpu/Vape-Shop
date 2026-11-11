import { NextResponse } from 'next/server';
import { db } from '@/db';
import { productVariants, products } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// Public list: shopper-facing fields only. Cost, supplier and barcode never leave the server; archived products are hidden.
export async function GET() {
  const rows = await db
    .select({
      id: productVariants.id, productId: productVariants.productId, sku: productVariants.sku,
      flavor: productVariants.flavor, nicotineStrength: productVariants.nicotineStrength,
      bottleSize: productVariants.bottleSize, color: productVariants.color,
      priceOverride: productVariants.priceOverride, stockQuantity: productVariants.stockQuantity,
      isActive: productVariants.isActive,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.isActive, true), eq(products.isActive, true)));
  return NextResponse.json(rows);
}
