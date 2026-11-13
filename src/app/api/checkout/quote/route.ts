import { NextResponse } from 'next/server';
import { blocksShoppers } from '@/lib/maintenance';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { resolveCart } from '@/lib/cart';
import { quoteOrder, FREE_SHIP_THRESHOLD, SHIPPING_FLAT } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

// The checkout page calls this whenever the basket, collection method or promo code changes.
// It returns the exact figures POST /api/checkout will charge, plus any stock problems,
// so the customer sees them before they pay.
const schema = z.object({
  mode: z.enum(['delivery', 'collect']).default('delivery'),
  promoCode: z.string().max(32).optional().nullable(),
});

export async function POST(req: Request) {
  if (await blocksShoppers()) {
    return NextResponse.json({ error: 'The website is in maintenance mode. Please try again later, or call the shop.' }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Choose delivery or collection.' }, { status: 400 });

  const session = await getSession();
  const items = await resolveCart(session.cart);
  if (!items.length) return NextResponse.json({ error: 'Your basket is empty.' }, { status: 400 });

  const stockIssues = items
    .filter((i) => i.quantity > i.stockQuantity)
    .map((i) => ({
      variantId: i.variantId,
      productName: i.productName,
      variantLabel: i.variantLabel,
      requested: i.quantity,
      available: i.stockQuantity,
      message: i.stockQuantity > 0
        ? `Only ${i.stockQuantity} left of ${i.productName} (${i.variantLabel}). Reduce the quantity to continue.`
        : `${i.productName} (${i.variantLabel}) is out of stock. Remove it to continue.`,
    }));

  const q = await quoteOrder({ items, mode: parsed.data.mode, promoCode: parsed.data.promoCode || null });
  if (!q.ok) return NextResponse.json({ error: q.error }, { status: q.status });

  return NextResponse.json({
    items: items.map((i) => ({
      variantId: i.variantId, productName: i.productName, variantLabel: i.variantLabel,
      quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: +(i.unitPrice * i.quantity).toFixed(2),
      available: i.stockQuantity,
    })),
    ...q.quote,
    rules: { shippingFlat: SHIPPING_FLAT, freeShippingThreshold: FREE_SHIP_THRESHOLD },
    stockIssues,
  });
}
