import { NextResponse } from 'next/server';
import { getSession, requireStaff } from '@/lib/session';
import { staffByPin, pinLocked, recordPinFailure, clearPinFailures, PIN_RE, ROLE_LABEL } from '@/lib/staff';
import { audit } from '@/lib/audit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Quick PIN switch on the till: the operator changes without a password login.
// The session becomes that staff member, so their sales are attributed to them.
const schema = z.object({ pin: z.string(), registerId: z.string().max(40).optional() });

export async function POST(req: Request) {
  // Only someone already signed in at the till can switch. Customers and signed-out visitors get nothing,
  // and their guesses don't count against the staff PIN lockout.
  if (!(await requireStaff())) return NextResponse.json({ error: 'Staff sign-in required.' }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !PIN_RE.test(parsed.data.pin)) {
    return NextResponse.json({ error: 'Enter your 4–6 digit PIN.' }, { status: 400 });
  }
  if (pinLocked()) return NextResponse.json({ error: 'Too many wrong PINs. Wait a few minutes or log in with your password.' }, { status: 429 });
  const u = await staffByPin(parsed.data.pin);
  if (!u) {
    recordPinFailure();
    return NextResponse.json({ error: 'PIN not recognised.' }, { status: 401 });
  }
  clearPinFailures();
  const s = await getSession();
  const previous = s.user ? { id: s.user.id, role: s.user.role } : null;
  s.user = { id: u.id, email: u.email, role: u.role as any, fullName: u.fullName ?? undefined };
  await s.save();
  await audit({ id: u.id, email: u.email, fullName: u.fullName, role: u.role }, 'staff.switch', 'user', u.id,
    { previousUserId: previous?.id ?? null }, parsed.data.registerId ?? null);
  return NextResponse.json({ ok: true, user: { id: u.id, name: u.fullName || u.email, role: u.role, label: ROLE_LABEL[u.role] } });
}
