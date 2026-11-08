import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { resolveCart, totals } from '@/lib/cart';

export async function PUT(req: Request) {
  const { lines } = (await req.json()) as { lines: { variantId: number; quantity: number }[] };
  const s = await getSession();
  s.cart = Array.isArray(lines)
    ? lines.filter((l) => l && typeof l.variantId === 'number' && l.quantity > 0).slice(0, 50)
    : [];
  await s.save();
  return NextResponse.json({ count: s.cart.reduce((a, l) => a + l.quantity, 0) });
}

export async function GET() {
  const s = await getSession();
  const items = await resolveCart(s.cart);
  const t = totals(items);
  return NextResponse.json({ count: items.reduce((a, i) => a + i.quantity, 0), items, ...t });
}
