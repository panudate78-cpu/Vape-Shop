import { NextResponse } from 'next/server';
import { db } from '@/db';
import { productVariants, products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';

export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await db.select({
      sku: productVariants.sku, product: products.name, brand: products.brand,
      flavor: productVariants.flavor, nicotine: productVariants.nicotineStrength,
      size: productVariants.bottleSize, stock: productVariants.stockQuantity,
      price: productVariants.priceOverride, basePrice: products.basePrice,
    })
    .from(productVariants).leftJoin(products, eq(products.id, productVariants.productId));
  const header = 'sku,brand,product,flavor,nicotine,size,stock,price';
  const body = rows.map((r) => [r.sku, r.brand, r.product, r.flavor, r.nicotine, r.size, r.stock, r.price ?? r.basePrice].map(csv).join(',')).join('\n');
  return new NextResponse(header + '\n' + body, {
    headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="inventory.csv"' },
  });
}
function csv(v: any) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
