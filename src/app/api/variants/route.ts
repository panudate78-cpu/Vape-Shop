import { NextResponse } from 'next/server';
import { db } from '@/db';
import { productVariants } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await db.select().from(productVariants).where(eq(productVariants.isActive, true));
  return NextResponse.json(rows);
}
