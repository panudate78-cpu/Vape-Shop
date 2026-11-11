import { NextResponse } from 'next/server';
import { db } from '@/db';
import { productVariants, products, categories } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';

function csv(v: any) {
  const s = String(v ?? '');
  if (/[",\n|]/.test(s) || s.startsWith('[') || s.startsWith('http')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const owner = a.role === 'ADMIN'; // cost prices are owner-only
  await audit(a, 'export.run', 'export', null, { kind: 'csv' });
  try { await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)`); } catch {}

  const rows = await db.select({
      sku: productVariants.sku,
      product: products.name,
      brand: products.brand,
      category: categories.name,
      description: products.description,
      images: products.images,
      ...(owner ? { costPrice: (products as any).costPrice } : {}),
      flavor: productVariants.flavor,
      nicotine: productVariants.nicotineStrength,
      size: productVariants.bottleSize,
      color: productVariants.color,
      stock: productVariants.stockQuantity,
      price: productVariants.priceOverride,
      basePrice: products.basePrice,
      lowStock: productVariants.lowStockThreshold,
      active: productVariants.isActive,
      barcode: productVariants.barcode,
    })
    .from(productVariants)
    .leftJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId));

  const cost = (r: any) => (owner ? [r.costPrice ?? ''] : []);
  const costHead = owner ? ['cost_price'] : [];
  const header = ['sku','product_name','brand','category','description','images',
    ...costHead, 'flavor','nicotine_strength','bottle_size','color','stock','price','low_stock_threshold','is_active','barcode','base_price'];
  const body = rows.map((r: any) => [
    r.sku, r.product, r.brand, r.category,
    r.description,
    Array.isArray(r.images) ? r.images.join('|') : (r.images ?? ''),
    ...cost(r),
    r.flavor, r.nicotine, r.size, r.color, r.stock,
    r.price ?? '',                       // this variant's own price; blank = the product's base price applies
    r.lowStock,
    r.active === false ? 'false' : 'true',
    r.barcode ?? '',
    r.basePrice,                         // read-only: the import ignores this column
  ].map(csv).join(',')).join('\n');
  return new NextResponse(header.join(',') + '\n' + body, {
    headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="inventory.csv"' },
  });
}
