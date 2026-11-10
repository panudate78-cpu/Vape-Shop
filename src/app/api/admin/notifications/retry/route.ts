import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { retryFailedNotifications } from '@/lib/order-events';

// Re-sends any order emails still pending or failed (e.g. after a provider outage).
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, ...(await retryFailedNotifications()) });
}
