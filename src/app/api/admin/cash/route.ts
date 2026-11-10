import { NextResponse } from 'next/server';
import { db } from '@/db';
import { cashShifts, cashMovements } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireStaff, requireAdmin } from '@/lib/session';
import { can, actorName } from '@/lib/staff';
import { audit } from '@/lib/audit';
import { openShift, shiftSummary, shiftMovements } from '@/lib/cash';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const reg = (r: string | null | undefined) => (r || 'Till 1').trim().slice(0, 40) || 'Till 1';
const money = z.number().min(0).max(100000).transform((n) => Math.round(n * 100) / 100);

// Shift state for a till. Cashiers do not see the expected figure while
// counting (blind count); managers and owners always see it.
export async function GET(req: Request) {
  const u = await requireStaff();
  if (!u) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);

  if (url.searchParams.get('history')) {
    if (!can(u.role, 'cash.review')) return NextResponse.json({ error: 'Forbidden — managers and owners only' }, { status: 403 });
    const shifts = await db.select().from(cashShifts).orderBy(desc(cashShifts.openedAt)).limit(100);
    return NextResponse.json({ shifts });
  }

  const register = reg(url.searchParams.get('register'));
  const shift = await openShift(register);
  if (!shift) return NextResponse.json({ register, shift: null });
  const sum = await shiftSummary(shift.id);
  const canSeeExpected = can(u.role, 'cash.review');
  return NextResponse.json({
    register,
    shift: { id: shift.id, openedAt: shift.openedAt, openedByName: shift.openedByName, openingFloat: Number(shift.openingFloat) },
    expected: canSeeExpected ? sum!.expected : undefined,
    breakdown: canSeeExpected ? sum!.breakdown : { salesCount: sum!.breakdown.salesCount, refundsCount: sum!.breakdown.refundsCount },
    movements: await shiftMovements(shift.id),
  });
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), register: z.string().optional(), openingFloat: money }),
  z.object({ action: z.literal('paid'), register: z.string().optional(), kind: z.enum(['paid_in', 'paid_out']), amount: z.number().positive().max(100000), reason: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal('close'), register: z.string().optional(), countedCash: money, note: z.string().trim().max(500).optional() }),
]);

export async function POST(req: Request) {
  const u = await requireStaff();
  if (!u) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid details' }, { status: 400 });
  const d = parsed.data;
  const register = reg(d.register);
  const actor = { id: u.id, email: u.email, role: u.role, fullName: u.fullName };
  const name = actorName(u);

  if (d.action === 'open') {
    try {
      const shift = await db.transaction(async (tx) => {
        if (await openShift(register, tx as any)) throw new Error('ALREADY_OPEN');
        const [s] = await tx.insert(cashShifts).values({
          register, status: 'open', openedByUserId: u.id, openedByName: name, openingFloat: d.openingFloat.toFixed(2),
        }).returning();
        return s;
      });
      await audit(actor, 'cash.open', 'shift', shift.id, { register, openingFloat: d.openingFloat }, register);
      return NextResponse.json({ ok: true, shiftId: shift.id });
    } catch (e: any) {
      if (e?.message === 'ALREADY_OPEN' || e?.code === '23505') return NextResponse.json({ error: `${register} already has an open shift.` }, { status: 409 });
      throw e;
    }
  }

  const shift = await openShift(register);
  if (!shift) return NextResponse.json({ error: `No open shift on ${register}. Open the till with a float first.` }, { status: 409 });

  if (d.action === 'paid') {
    await db.insert(cashMovements).values({
      shiftId: shift.id, kind: d.kind, amount: d.amount.toFixed(2), reason: d.reason,
      staffUserId: u.id, staffName: name,
    });
    await audit(actor, d.kind === 'paid_in' ? 'cash.paid_in' : 'cash.paid_out', 'shift', shift.id, { amount: d.amount, reason: d.reason }, register);
    return NextResponse.json({ ok: true });
  }

  // close: lock the shift row so no sale can land in it mid-count.
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM cash_shifts WHERE id = ${shift.id} FOR UPDATE`);
      const sum = await shiftSummary(shift.id, tx as any);
      if (!sum) throw new Error('GONE');
      const variance = Math.round((d.countedCash - sum.expected) * 100) / 100;
      if (Math.abs(variance) >= 0.005 && !(d as any).note) {
        throw Object.assign(new Error('NOTE_REQUIRED'), { variance, expected: sum.expected });
      }
      await tx.update(cashShifts).set({
        status: 'closed', closedByUserId: u.id, closedByName: name, closedAt: new Date(),
        expectedCash: sum.expected.toFixed(2), countedCash: d.countedCash.toFixed(2),
        variance: variance.toFixed(2), discrepancyNote: (d as any).note || null,
      }).where(eq(cashShifts.id, shift.id));
      return { expected: sum.expected, variance };
    });
    await audit(actor, 'cash.close', 'shift', shift.id, {
      register, expected: result.expected, counted: d.countedCash, variance: result.variance, note: (d as any).note || null,
    }, register);
    return NextResponse.json({ ok: true, expected: result.expected, counted: d.countedCash, variance: result.variance });
  } catch (e: any) {
    if (e?.message === 'NOTE_REQUIRED') {
      return NextResponse.json({
        error: `Counted cash is ${e.variance > 0 ? '£' + e.variance.toFixed(2) + ' over' : '£' + Math.abs(e.variance).toFixed(2) + ' short'}. Add a note explaining the discrepancy, then close again.`,
        code: 'NOTE_REQUIRED', variance: e.variance,
      }, { status: 400 });
    }
    throw e;
  }
}
