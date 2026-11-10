import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { orders, orderItems, promoCodes, productVariants, addresses, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { resolveCart, totals } from '@/lib/cart';
import { isOfAge } from '@/lib/auth';
import { createPaymentIntent } from '@/lib/payments';
import { reserveForOrder, StockError } from '@/lib/stock';
import { saleGate, recordAgeCheck, ComplianceError } from '@/lib/compliance';

const addressSchema = z.object({
  line1: z.string().min(2), line2: z.string().optional().default(''),
  city: z.string().min(2), postcode: z.string().min(3), county: z.string().optional().default(''),
});
const schema = z.object({
  mode: z.enum(['delivery', 'collect']).default('delivery'),
  shippingAddress: addressSchema.optional(),
  email: z.string().email().optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compliance: z.literal(true),
  promoCode: z.string().max(32).optional().nullable(),
});

const SHIPPING_FLAT = 3.99;
const FREE_SHIP_THRESHOLD = 30;

export async function POST(req: Request) {
  const session = await getSession();
  const items = await resolveCart(session.cart);
  if (!items.length) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  // stock check
  for (const i of items) if (i.quantity > i.stockQuantity) return NextResponse.json({ error: `${i.productName} (${i.variantLabel}) only has ${i.stockQuantity} in stock` }, { status: 400 });

  // Stop-sales, recalls and recorded product violations stop the order before it is created.
  let gate;
  try {
    gate = await saleGate(items.map((i) => i.variantId));
  } catch (e) {
    if (e instanceof ComplianceError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid checkout data', issues: parsed.error.flatten() }, { status: 400 });
  const { mode, dob, compliance, promoCode } = parsed.data;
  if (!isOfAge(dob)) return NextResponse.json({ error: 'You must be 18 or over to place an order.' }, { status: 403 });
  if (!compliance) return NextResponse.json({ error: 'You must accept the compliance declaration.' }, { status: 400 });
  if (mode === 'delivery' && !parsed.data.shippingAddress) return NextResponse.json({ error: 'Shipping address required' }, { status: 400 });

  const email = session.user?.email || parsed.data.email;
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  let discount = 0; let shippingCost = mode === 'delivery' ? SHIPPING_FLAT : 0;
  let promoRow: typeof promoCodes.$inferSelect | null = null;
  const subtotal = totals(items).subtotal;
  if (promoCode) {
    const [p] = await db.select().from(promoCodes).where(eq(promoCodes.code, promoCode.toUpperCase())).limit(1);
    if (!p || !p.active) return NextResponse.json({ error: 'Invalid promo' }, { status: 400 });
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) return NextResponse.json({ error: 'Promo expired' }, { status: 400 });
    if (p.usageLimit != null && (p.timesUsed ?? 0) >= p.usageLimit) return NextResponse.json({ error: 'Promo used up' }, { status: 400 });
    if (Number(p.minSpend ?? 0) > subtotal) return NextResponse.json({ error: `Minimum spend £${Number(p.minSpend).toFixed(2)}` }, { status: 400 });
    if (p.type === 'percent') discount = +(subtotal * (Number(p.value) / 100)).toFixed(2);
    else if (p.type === 'fixed') discount = Number(p.value);
    else if (p.type === 'shipping' && mode === 'delivery') shippingCost = Math.max(0, shippingCost - Number(p.value));
    promoRow = p;
  }
  if (mode === 'delivery' && subtotal >= FREE_SHIP_THRESHOLD) shippingCost = 0;
  const total = Math.max(0, subtotal + shippingCost - discount);

  const addr = mode === 'delivery' ? parsed.data.shippingAddress : null;

  const [order] = await db
    .insert(orders)
    .values({
      userId: session.user?.id ?? null,
      guestEmail: session.user ? null : email,
      status: 'pending',
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      shippingCost: shippingCost.toFixed(2),
      totalAmount: total.toFixed(2),
      shippingAddress: addr as any,
      collectionMode: mode,
      paymentGateway: process.env.PAYMENT_GATEWAY || 'mock',
      paymentStatus: 'pending',
      dobVerified: true,
      complianceAccepted: true,
      promoCode: promoRow?.code ?? null,
    })
    .returning();

  await db.insert(orderItems).values(
    items.map((i) => ({
      orderId: order.id,
      variantId: i.variantId,
      productName: i.productName,
      variantLabel: i.variantLabel,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toFixed(2),
    }))
  );

  // Hold the stock for this checkout (all lines or none). Released automatically
  // if the customer doesn't pay within the reservation window.
  try {
    await reserveForOrder(order.id, items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, productName: i.productName })));
  } catch (e) {
    await db.update(orders).set({ status: 'cancelled', paymentStatus: 'failed', updatedAt: new Date() }).where(eq(orders.id, order.id));
    if (e instanceof StockError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }

  // Online age check for age-restricted items: the declared date of birth is recorded.
  // It is weaker evidence than an ID check, so the order is only handed over after an ID
  // check at collection or delivery (see the fulfilment rules).
  if (gate.restrictedIds.length) {
    await recordAgeCheck(db, {
      channel: 'online', result: 'passed', method: 'dob_declared',
      staffName: null, orderId: order.id, customerEmail: email, userId: session.user?.id ?? null,
      productSummary: gate.restrictedNames.join('; '),
    });
  }

  const intent = await createPaymentIntent({ amount: total, orderId: order.id, email, secret: 'dev-secret' });
  await db.update(orders).set({ paymentIntentId: intent.id }).where(eq(orders.id, order.id));

  return NextResponse.json({ orderId: order.id, total, paymentIntentId: intent.id, clientToken: intent.clientToken });
}
