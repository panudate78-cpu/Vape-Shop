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
          <details className="relative">
            <summary className="btn-outline cursor-pointer list-none" title="Download paid orders as an accounts-importable CSV">📥 Accounts export ▾</summary>
            <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg py-1 z-20 text-sm">
              <a href="/api/admin/quickbooks" className="block px-3 py-2 text-zinc-200 hover:bg-zinc-800 hover:text-white">📊 QuickBooks (Sales Receipts)</a>
              <a href="/api/admin/xero" className="block px-3 py-2 text-zinc-200 hover:bg-zinc-800 hover:text-white">🔵 Xero (Invoices)</a>
              <a href="/api/admin/sage" className="block px-3 py-2 text-zinc-200 hover:bg-zinc-800 hover:text-white">🟢 Sage (SI / VAT split)</a>
            </div>
          </details>
        </div>
      </div>
      <AdminStatsClient />
    </div>
  );
}
