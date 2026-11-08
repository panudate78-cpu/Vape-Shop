import Link from 'next/link';
import { db } from '@/db';
import { products } from '@/db/schema';
export const dynamic = 'force-dynamic';
export default async function AdminProducts() {
  const rows = await db.select().from(products).orderBy(products.brand, products.name);
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-amber-400">Products</h1>
        <Link href="/admin/products/new" className="btn-amber">+ New product</Link>
      </div>
      <div className="card p-0 overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-left"><tr><th className="p-3">Name</th><th className="p-3">Brand</th><th className="p-3">Base price</th><th className="p-3">Active</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-zinc-800">
                <td className="p-3">{p.name}</td><td className="p-3 text-zinc-400">{p.brand}</td>
                <td className="p-3">£{Number(p.basePrice).toFixed(2)}</td>
                <td className="p-3">{p.isActive ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
