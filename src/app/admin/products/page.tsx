import { db } from '@/db';
import { products, categories } from '@/db/schema';
import { asc } from 'drizzle-orm';
import AdminProductsClient from './products-client';
export const dynamic = 'force-dynamic';

export default async function AdminProducts() {
  const [rows, cats] = await Promise.all([
    db.select().from(products).orderBy(products.brand, products.name),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
  ]);
  return (
    <AdminProductsClient
      initial={rows.map((r) => ({ ...r, basePrice: Number(r.basePrice) }))}
      categories={cats}
    />
  );
}
