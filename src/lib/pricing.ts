// One pricing rule set for the storefront. The checkout page shows the quote from
// /api/checkout/quote, and POST /api/checkout charges the same quote, so the
// total a customer sees is the total they pay.
import { db } from '@/db';
import { promoCodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { CartItem } from './cart';

export const SHIPPING_FLAT = 3.99;
export const FREE_SHIP_THRESHOLD = 30;

export type Mode = 'delivery' | 'collect';

export type Quote = {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  promoCode: string | null;
  promoType: string | null;
};

export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; status: number; error: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Pure rule set, so it can be unit-tested without a database.
export function priceOrder(input: {
  subtotal: number;
  mode: Mode;
  promo?: { type: string; value: number } | null;
}): { shipping: number; discount: number; total: number } {
  const subtotal = r2(input.subtotal);
  let shipping = input.mode === 'delivery' ? SHIPPING_FLAT : 0;
  let discount = 0;
  const p = input.promo;
  if (p) {
    if (p.type === 'percent') discount = r2(subtotal * (p.value / 100));
    else if (p.type === 'fixed') discount = Math.min(subtotal, r2(p.value));
    else if (p.type === 'shipping' && input.mode === 'delivery') shipping = Math.max(0, r2(shipping - p.value));
  }
  if (input.mode === 'delivery' && subtotal >= FREE_SHIP_THRESHOLD) shipping = 0;
  const total = Math.max(0, r2(subtotal + shipping - discount));
  return { shipping: r2(shipping), discount: r2(discount), total };
}

// Looks up and checks a promo code. Returns the same messages the checkout shows.
export async function checkPromo(code: string, subtotal: number): Promise<
  | { ok: true; promo: typeof promoCodes.$inferSelect }
  | { ok: false; status: number; error: string }
> {
  const [p] = await db.select().from(promoCodes).where(eq(promoCodes.code, code.toUpperCase())).limit(1);
  if (!p || !p.active) return { ok: false, status: 400, error: 'That promo code is not valid.' };
  if (p.expiresAt && new Date(p.expiresAt) < new Date()) return { ok: false, status: 400, error: 'That promo code has expired.' };
  if (p.usageLimit != null && (p.timesUsed ?? 0) >= p.usageLimit) return { ok: false, status: 400, error: 'That promo code has been fully used.' };
  if (Number(p.minSpend ?? 0) > subtotal) return { ok: false, status: 400, error: `This code needs a basket of at least £${Number(p.minSpend).toFixed(2)}.` };
  return { ok: true, promo: p };
}

export async function quoteOrder(args: { items: CartItem[]; mode: Mode; promoCode?: string | null }): Promise<QuoteResult> {
  const subtotal = r2(args.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
  let promo: { type: string; value: number; code: string } | null = null;
  if (args.promoCode) {
    const c = await checkPromo(args.promoCode, subtotal);
    if (!c.ok) return c;
    promo = { type: c.promo.type, value: Number(c.promo.value), code: c.promo.code };
  }
  const priced = priceOrder({ subtotal, mode: args.mode, promo });
  return {
    ok: true,
    quote: {
      subtotal,
      ...priced,
      promoCode: promo ? promo.code : null,
      promoType: promo ? promo.type : null,
    },
  };
}
