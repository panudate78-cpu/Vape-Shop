import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users, categories, products, productVariants, promoCodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth';
import { seedCategories, seedProducts, seedPromos } from '@/lib/seed-data';

export async function POST() {
  // Creates accounts with known demo passwords, so it is closed in production unless ALLOW_SEED=true, and owner-only otherwise.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { requireOwner } = await import('@/lib/session');
  if (!(await requireOwner())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // idempotent seed — safe to call repeatedly
  for (const c of seedCategories) {
    const [existing] = await db.select().from(categories).where(eq(categories.slug, c.slug)).limit(1);
    if (!existing) await db.insert(categories).values(c);
  }
  const catRows = await db.select().from(categories);
  const catBySlug = Object.fromEntries(catRows.map((c) => [c.slug, c.id]));
  for (const p of seedProducts) {
    const catId = catBySlug[p.categorySlug];
    const [existing] = await db.select().from(products).where(eq(products.name, p.name)).limit(1);
    let productId: number;
    if (existing) { productId = existing.id; } else {
      const [r] = await db.insert(products).values({
        name: p.name, brand: p.brand, categoryId: catId, description: p.description,
        basePrice: p.basePrice.toString(), vgPgRatio: p.vgPgRatio, flavorProfile: p.flavorProfile, tags: p.tags, images: [],
      }).returning({ id: products.id });
      productId = r.id;
    }
    for (const [i, v] of p.variants.entries()) {
      const sku = `${p.brand.substring(0, 3).toUpperCase()}-${p.name.substring(0, 3).toUpperCase()}-${(i + 1).toString().padStart(3, '0')}`;
      const [ev] = await db.select().from(productVariants).where(eq(productVariants.sku, sku)).limit(1);
      if (!ev) {
        await db.insert(productVariants).values({
          productId, sku, flavor: v.flavor, nicotineStrength: v.nic, bottleSize: v.size,
          priceOverride: v.price != null ? v.price.toString() : null, stockQuantity: v.stock, lowStockThreshold: 5, isActive: true,
        });
      }
    }
  }
  for (const pr of seedPromos) {
    const [existing] = await db.select().from(promoCodes).where(eq(promoCodes.code, pr.code)).limit(1);
    if (!existing) await db.insert(promoCodes).values(pr as any);
  }
  const [admin] = await db.select().from(users).where(eq(users.email, 'admin@vapeshop.co.uk')).limit(1);
  if (!admin) await db.insert(users).values({ email: 'admin@vapeshop.co.uk', passwordHash: await hashPassword('Admin123!'), role: 'ADMIN', fullName: 'Store Manager' });
  const [demo] = await db.select().from(users).where(eq(users.email, 'demo@customer.co.uk')).limit(1);
  if (!demo) await db.insert(users).values({ email: 'demo@customer.co.uk', passwordHash: await hashPassword('Customer123!'), role: 'CUSTOMER', fullName: 'Demo Customer' });
  return NextResponse.json({ ok: true });
}

// auto-seed on GET too (safe & idempotent)
export async function GET() { return POST(); }
