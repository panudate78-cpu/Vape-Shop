import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function POST() {
  const s = await getSession();
  s.user = undefined;
  await s.save();
  return NextResponse.json({ ok: true });
}
