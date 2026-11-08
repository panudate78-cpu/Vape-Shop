import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { resolveCart, totals } from '@/lib/cart';

export async function GET() {
  const s = await getSession();
  const items = await resolveCart(s.cart);
  const t = totals(items);
  return NextResponse.json({ items, ...t });
}
