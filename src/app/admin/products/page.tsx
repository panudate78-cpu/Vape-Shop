import { db } from '@/db';
import { products } from '@/db/schema';
import AdminProductsClient from './products-client';
export const dynamic = 'force-dynamic';
export default async function AdminProducts() {
  const rows = await db.select().from(products).orderBy(products.brand, products.name);
  return <AdminProductsClient initial={rows.map((r) => ({ ...r, basePrice: Number(r.basePrice) }))} />;
}
