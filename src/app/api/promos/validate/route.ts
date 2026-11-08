import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { promoCodes } from '@/db/schema';
import { eq } from 'drizzle-orm';

const schema = z.object({ code: z.string().min(1), subtotal: z.coerce.number().min(0) });
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Bad input' }, { status: 400 });
  const { code, subtotal } = parsed.data;
  const [p] = await db.select().from(promoCodes).where(eq(promoCodes.code, code.toUpperCase())).limit(1);
  if (!p || !p.active) return NextResponse.json({ error: 'Invalid promo code' }, { status: 404 });
  if (p.expiresAt && new Date(p.expiresAt) < new Date()) return NextResponse.json({ error: 'Promo code expired' }, { status: 410 });
  if (p.usageLimit != null && (p.timesUsed ?? 0) >= p.usageLimit) return NextResponse.json({ error: 'Promo code fully redeemed' }, { status: 410 });
  if (Number(p.minSpend ?? 0) > subtotal) return NextResponse.json({ error: `Minimum spend £${Number(p.minSpend).toFixed(2)}` }, { status: 400 });
  let discount = 0; let shippingDiscount = 0;
  if (p.type === 'percent') discount = +(subtotal * (Number(p.value) / 100)).toFixed(2);
  else if (p.type === 'fixed') discount = Number(p.value);
  else if (p.type === 'shipping') shippingDiscount = Number(p.value);
  return NextResponse.json({ code: p.code, type: p.type, discount, shippingDiscount });
}
