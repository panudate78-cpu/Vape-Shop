import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { loadPaidOrders, toXero } from '@/lib/accounting/export';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/xero?from=...&to=...&source=...
 *
 * Exports PAID orders as a Xero Sales Invoices CSV importable via:
 * Business → Invoices → Import → Import Invoices → CSV.
 *
 * Columns: *ContactName, *InvoiceNumber, *InvoiceDate, *DueDate, Description,
 * *Quantity, *UnitAmount, *AccountCode, *TaxType, Reference, Status, Currency,
 * BrandingTheme. Required columns marked with *.
 *
 * Lines are imported as AUTHORISED (unpaid). For fully paid orders, record
 * payment in Xero after import, or reconcile against your Stripe/Square/cash
 * bank feed. You can override defaults with env vars or query params:
 *   XERO_SALES_ACCOUNT / ?salesAccount   (chart-of-account code, default 200)
 *   XERO_TAX_RATE     / ?taxRate         (Xero tax rate name, default '20% (VAT on Income)')
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
  const { header, rows } = toXero(orders, {
    salesAccount: s('salesAccount'),
    shippingAccount: s('shippingAccount'),
    discountAccount: s('discountAccount'),
    taxRate: s('taxRate'),
  });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(header.join(',') + '\n' + rows.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="xero-sales-${today}.csv"`,
    },
  });
}
