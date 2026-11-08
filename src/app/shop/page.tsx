import { ShopClient } from './shop-client';
import { db } from '@/db';
import { categories } from '@/db/schema';

export const dynamic = 'force-dynamic';

export default async function ShopPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const cats = await db.select().from(categories).orderBy(categories.name);
  const initialCategory = typeof searchParams.category === 'string' ? searchParams.category : '';
  const initialQ = typeof searchParams.q === 'string' ? searchParams.q : '';
  return <ShopClient categories={cats} initialCategory={initialCategory} initialQ={initialQ} />;
}
