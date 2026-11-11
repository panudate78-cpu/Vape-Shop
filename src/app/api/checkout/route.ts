import { currentCostMap, costForLine } from '@/lib/reports/cost';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { orders, orderItems, promoCodes, productVariants, addresses, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { resolveCart } from '@/lib/cart';
import { quoteOrder } from '@/lib/pricing';
import { isOfAge } from '@/lib/auth';
import { createPaymentIntent } from '@/lib/payments';
import { reserveForOrder, StockError } from '@/lib/stock';
import { saleGate, recordAgeCheck, ComplianceError } from '@/lib/compliance';

// UK postcode, e.g. KT9 2RT (spaces optional).
const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const addressSchema = z.object({
  name: z.string().trim().min(2, 'Enter the recipient name').max(100).optional().default(''),
  line1: z.string().trim().min(2, 'Enter address line 1'), line2: z.string().trim().optional().default(''),
  city: z.string().trim().min(2, 'Enter the town or city'), county: z.string().trim().optional().default(''),
  postcode: z.string().trim().regex(UK_POSTCODE_RE, 'Enter a valid UK postcode, e.g. KT9 2RT'),
});
const schema = z.object({
  mode: z.enum(['delivery', 'collect']).default('delivery'),
  shippingAddress: addressSchema.optional(),
  email: z.string().email().optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compliance: z.literal(true),
  promoCode: z.string().max(32).optional().nullable(),
});

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

  // Same quote the checkout page showed (see /api/checkout/quote).
  const q = await quoteOrder({ items, mode, promoCode });
  if (!q.ok) return NextResponse.json({ error: q.error }, { status: q.status });
  const { subtotal, shipping: shippingCost, discount, total, promoCode: appliedPromo } = q.quote;

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
      promoCode: appliedPromo,
    })
    .returning();

  session.pendingOrderIds = [...(session.pendingOrderIds ?? []).slice(-49), order.id];
  await session.save();

  const itemCosts = await currentCostMap(items.map((i) => i.variantId)); // cost snapshot for reporting
  await db.insert(orderItems).values(
    items.map((i) => ({
      orderId: order.id,
      variantId: i.variantId,
      productName: i.productName,
      variantLabel: i.variantLabel,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toFixed(2),
      unitCost: costForLine(itemCosts, i.variantId),
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

  const intent = await createPaymentIntent({ amount: total, orderId: order.id, email, secret: process.env.WEBHOOK_SECRET ?? '' });
  await db.update(orders).set({ paymentIntentId: intent.id }).where(eq(orders.id, order.id));

  return NextResponse.json({ orderId: order.id, total, paymentIntentId: intent.id, clientToken: intent.clientToken });
}
