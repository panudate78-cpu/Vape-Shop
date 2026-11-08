import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { loadPaidOrders, toSage } from '@/lib/accounting/export';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/sage?from=...&to=...&source=...
 *
 * Exports PAID orders as a Sage Business Cloud / Sage 50 Sales Invoice (SI)
 * audit-file CSV. Imports via Sage's CSV import (Invoices → Import or File →
 * Import in Sage 50).
 *
 * Columns: Type, Account Reference, Date, Reference, Details, Net, Tax Code,
 * Tax, Total. Prices are GROSS at UK 20% VAT; the export splits each line into
 * Net + VAT (T1) automatically, matching UK retail inclusive-of-VAT pricing.
 *
 * Customer Account Reference is auto-derived as the first 8 alphanumeric
 * characters of the customer name (Sage limits it to 8 chars). You'll want to
 * create those customer records in Sage first, or set a default customer ref
 * via ?customerRef=ABC123.
 *
 * Override defaults via env vars or query params:
 *   SAGE_SALES_NOMINAL / ?nominalCode       (default 4000 = Sales)
 *   SAGE_SHIPPING_NOMINAL / ?shippingNominal (default = sales nominal)
 *   SAGE_DISCOUNT_NOMINAL / ?discountNominal (default = sales nominal)
 *   SAGE_TAX_CODE / ?taxCode                (default 1 = T1 standard 20%)
 */
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const orders = await loadPaidOrders({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    source: url.searchParams.get('source'),
  });
  const s = (k: string) => url.searchParams.get(k) || undefined;
  const { header, rows } = toSage(orders, {
    nominalCode: s('nominalCode'),
    shippingNominal: s('shippingNominal'),
    discountNominal: s('discountNominal'),
    taxCode: s('taxCode'),
    customerRef: s('customerRef'),
  });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(header.join(',') + '\n' + rows.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sage-sales-${today}.csv"`,
    },
  });
}
