import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const s = await getSession();
  return NextResponse.json({ user: s.user ?? null, cartCount: s.cart.reduce((a, l) => a + l.quantity, 0) });
}
