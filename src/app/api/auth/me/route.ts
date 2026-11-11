import { NextResponse } from 'next/server';
import { getSession, requireUser } from '@/lib/session';

// Who is signed in. requireUser checks the account is still active on every call.
export async function GET() {
  const s = await getSession();
  const user = await requireUser();
  return NextResponse.json({ user, cartCount: s.cart.reduce((a, l) => a + l.quantity, 0) });
}
