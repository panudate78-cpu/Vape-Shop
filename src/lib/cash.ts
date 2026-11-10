// Cash drawer maths. Expected cash = opening float + cash takings − cash refunds
// + paid in − paid out. Card takings never touch the drawer.
import { db } from '@/db';
import { cashShifts, cashMovements } from '@/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';

type Exec = Pick<typeof db, 'select' | 'execute'>;

export async function openShift(register: string, exec: Exec = db) {
  const [s] = await exec.select().from(cashShifts).where(and(eq(cashShifts.register, register), eq(cashShifts.status, 'open'))).limit(1);
  return s ?? null;
}

export async function shiftSummary(shiftId: number, exec: Exec = db) {
  const [s] = await exec.select().from(cashShifts).where(eq(cashShifts.id, shiftId)).limit(1);
  if (!s) return null;
  // Cash takings: cash sales in full, plus the cash part of split sales.
  const rows: any[] = await exec.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total_amount::numeric ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN o.payment_method = 'refund_cash' THEN o.total_amount::numeric ELSE 0 END), 0) AS cash_refunds,
      COALESCE(SUM(CASE WHEN o.payment_method = 'card' THEN o.total_amount::numeric ELSE 0 END), 0) AS card_sales,
      COALESCE(SUM(CASE WHEN o.payment_method = 'refund_card' THEN o.total_amount::numeric ELSE 0 END), 0) AS card_refunds,
      COUNT(*) FILTER (WHERE o.payment_method IN ('cash','card','split')) AS sales_count,
      COUNT(*) FILTER (WHERE o.payment_method IN ('refund_cash','refund_card')) AS refunds_count
    FROM orders o WHERE o.shift_id = ${shiftId} AND o.status <> 'cancelled'`);
  const splitRows: any[] = await exec.execute(sql`
    SELECT COALESCE(SUM((elem->>'amount')::numeric), 0) AS split_cash
    FROM orders o, jsonb_array_elements(o.payment_breakdown) elem
    WHERE o.shift_id = ${shiftId} AND o.payment_method = 'split' AND o.status <> 'cancelled' AND elem->>'method' = 'cash'`);
  const movs = await exec.select({
    kind: cashMovements.kind, amount: cashMovements.amount,
  }).from(cashMovements).where(eq(cashMovements.shiftId, shiftId));
  const n = (v: unknown) => Number(v ?? 0);
  const r = rows[0] ?? {};
  const cashSales = n(r.cash_sales) + n(splitRows[0]?.split_cash);
  const cashRefunds = n(r.cash_refunds); // negative
  const paidIn = movs.filter((m) => m.kind === 'paid_in').reduce((t, m) => t + n(m.amount), 0);
  const paidOut = movs.filter((m) => m.kind === 'paid_out').reduce((t, m) => t + n(m.amount), 0);
  const floatAmt = n(s.openingFloat);
  const expected = Math.round((floatAmt + cashSales + cashRefunds + paidIn - paidOut) * 100) / 100;
  return {
    shift: s,
    expected,
    breakdown: {
      openingFloat: floatAmt, cashSales, cashRefunds, paidIn, paidOut,
      cardSales: n(r.card_sales), cardRefunds: n(r.card_refunds),
      salesCount: n(r.sales_count), refundsCount: n(r.refunds_count),
    },
  };
}

export async function shiftMovements(shiftId: number, exec: Exec = db) {
  return exec.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId)).orderBy(desc(cashMovements.createdAt)).limit(100);
}
