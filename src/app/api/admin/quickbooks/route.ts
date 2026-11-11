import { standardVatRate } from '@/lib/reports/load';
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/session';
import { loadPaidOrders, toQuickBooks } from '@/lib/accounting/export';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/quickbooks?from=YYYY-MM-DD&to=YYYY-MM-DD&source=online|pos|all
 *
 * Exports PAID orders as a QuickBooks Online Sales Receipts CSV.
 */
export async function GET(req: Request) {
  const a = await requireOwner();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await audit(a, 'export.run', 'export', null, { kind: 'quickbooks', url: new URL(req.url).search });

  const url = new URL(req.url);
  const orders = await loadPaidOrders({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    source: url.searchParams.get('source'),
  });
  const s = (k: string) => url.searchParams.get(k) || undefined;
  const { header, rows } = toQuickBooks(orders, {
    depositTo: s('depositTo'),
    defaultItem: s('defaultItem'),
    shippingItem: s('shippingItem'),
    discountItem: s('discountItem'),
    std: await standardVatRate(),
  });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(header.join(',') + '\n' + rows.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="quickbooks-sales-${today}.csv"`,
    },
  });
}
