import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { AdminStatsClient } from './admin-stats';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const admin = await requireAdmin();
  if (!admin) redirect('/login?next=/admin');
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-amber-400">Admin dashboard</h1>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/products/new" className="btn-amber">+ New product</Link>
          <a href="/api/admin/export" className="btn-outline">Export inventory</a>
          <a href="/api/admin/quickbooks" className="btn-outline" title="Download paid orders as a QuickBooks-importable CSV (last 90 days, all sources)">📊 QuickBooks export</a>
        </div>
      </div>
      <AdminStatsClient />
    </div>
  );
}
