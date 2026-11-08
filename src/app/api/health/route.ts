import { NextResponse } from 'next/server';

/**
 * Diagnostics endpoint — no DB imports, no session, so if the app is 500-ing
 * this will still respond and let us see whether the failure is at boot level
 * or only in routes that touch the DB.
 *
 * GET /api/health → { ok:true, env:{...} }
 */
export async function GET() {
  const checks = {
    NODE_ENV: process.env.NODE_ENV || 'unset',
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlPrefix: process.env.DATABASE_URL?.slice(0, 30) || null,
    hasSessionPassword: !!process.env.SESSION_PASSWORD,
    sessionPasswordLength: (process.env.SESSION_PASSWORD || '').length,
    paymentGateway: process.env.PAYMENT_GATEWAY || 'unset',
    ageThreshold: process.env.NEXT_PUBLIC_AGE_THRESHOLD || '18 (default)',
  };

  // Try a DB ping separately so we can report failure without 500'ing.
  let dbOk = false;
  let dbError: string | null = null;
  try {
    const { db } = await import('@/db');
    const { sql } = await import('drizzle-orm');
    const r = await db.execute(sql`SELECT 1 AS ok`);
    dbOk = !!(r && (r as any).rows?.[0]?.ok || (r as any)[0]?.ok);
  } catch (e: any) {
    dbError = e?.message || String(e);
  }

  return NextResponse.json(
    { ok: dbOk, time: new Date().toISOString(), checks, dbOk, dbError },
    { status: dbOk ? 200 : 503 },
  );
}
