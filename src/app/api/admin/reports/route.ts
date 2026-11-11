import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { isYmd, londonToday } from '@/lib/reports/london';
import { loadReport } from '@/lib/reports/load';

export const dynamic = 'force-dynamic';

// Owner reports. Management (owner and manager) can read sales, payments, staff, cash and stock counts.
// Cost, gross profit and stock valued at cost are returned to the owner only.
// GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD  (London dates, inclusive; default today)
const MAX_DAYS = 400;

export async function GET(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const today = londonToday();
  const from = url.searchParams.get('from') || today;
  const to = url.searchParams.get('to') || from;
  if (!isYmd(from) || !isYmd(to)) return NextResponse.json({ error: 'Dates must be YYYY-MM-DD.' }, { status: 400 });
  if (to < from) return NextResponse.json({ error: '"To" is before "From".' }, { status: 400 });
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days > MAX_DAYS) return NextResponse.json({ error: `Choose a range of ${MAX_DAYS} days or less.` }, { status: 400 });
  const slowDays = Math.min(365, Math.max(7, Number(url.searchParams.get('slowDays') || 60) || 60));

  const report = await loadReport(from, to, { isOwner: a.role === 'ADMIN', slowDays });
  return NextResponse.json({ ...report, viewer: { role: a.role, canSeeProfit: a.role === 'ADMIN' }, today });
}
