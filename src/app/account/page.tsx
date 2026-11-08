import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const s = await getSession();
  if (!s.user) redirect('/login?next=/account');
  const rows = await db.select().from(orders).where(eq(orders.userId, s.user.id)).orderBy(desc(orders.createdAt)).limit(50);
  return (
    <div>
      <h1 className="text-2xl font-bold">Your account</h1>
      <p className="text-slate-500 text-sm">Signed in as {s.user.email} ({s.user.role}).</p>
      {s.user.role === 'ADMIN' && <p className="mt-2"><Link href="/admin" className="text-amber-400 underline">Open admin dashboard →</Link></p>}
      <h2 className="font-bold mt-8 mb-3">Order history</h2>
      {rows.length === 0 ? (
        <div className="card text-center py-10 text-slate-500">No orders yet. <Link href="/shop" className="text-slate-900 underline">Start shopping</Link></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100/50 text-left">
              <tr><th className="p-3">Order</th><th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3">Mode</th><th className="p-3 text-right">Total</th></tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-slate-200 hover:bg-white/60">
                  <td className="p-3"><Link href={`/order/${o.id}`} className="text-slate-900 underline">#{o.id}</Link></td>
                  <td className="p-3 text-slate-500">{new Date(o.createdAt!).toLocaleDateString()}</td>
                  <td className="p-3"><span className="tag bg-[#BBDEFB]/20 text-slate-900">{o.status}</span></td>
                  <td className="p-3 text-slate-500">{o.collectionMode}</td>
                  <td className="p-3 text-right font-semibold">{formatPrice(o.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
