import { NextResponse } from 'next/server';
import { db } from '@/db';
import { ageChecks } from '@/db/schema';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { requireStaff } from '@/lib/session';
import { can } from '@/lib/staff';

export const dynamic = 'force-dynamic';

const LONDON = 'Europe/London';
// Instant of 00:00 London time on a YYYY-MM-DD day, independent of the server's timezone (handles BST).
function londonDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    guess -= asUtc - target;
  }
  return new Date(guess);
}
function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// Age-check log. ?result=refused gives the refusal log (date, staff member, reason).
// Filters: result, channel, from/to (YYYY-MM-DD, UK calendar days; to is inclusive).
export async function GET(req: Request) {
  const u = await requireStaff();
  if (!u || !can(u.role, 'compliance.view')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const filters: any[] = [];
  const result = sp.get('result');
  const channel = sp.get('channel');
  if (result === 'refused' || result === 'passed') filters.push(eq(ageChecks.result, result));
  if (channel && ['till', 'collection', 'delivery', 'online'].includes(channel)) filters.push(eq(ageChecks.channel, channel));
  const from = sp.get('from'); const to = sp.get('to');
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) filters.push(gte(ageChecks.at, londonDayStart(from)));
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) filters.push(lt(ageChecks.at, londonDayStart(nextDay(to))));
  const rows = await db.select().from(ageChecks).where(filters.length ? and(...filters) : undefined).orderBy(desc(ageChecks.at)).limit(300);
  return NextResponse.json(rows);
}
