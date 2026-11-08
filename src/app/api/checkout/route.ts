import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, productVariants, products, promoCodes, payments } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createPaymentIntent, shippingRates, getGatewayName } from "@/lib/payments";
import { isAdult } from "@/lib/format";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { items, shippingAddress, shippingMethod, promoCode, guestEmail, dob, complianceAccepted, cardLast4 } = body as {
      items: { variantId: string; quantity: number }[];
      shippingAddress: Record<string, string>;
      shippingMethod: string;
      promoCode?: string;
      guestEmail?: string;
      dob: string;
      complianceAccepted: boolean;
      cardLast4?: string;
    };

    // --- Compliance ---
    if (!dob || !isAdult(dob)) {
      return NextResponse.json({ error: `You must be ${process.env.NEXT_PUBLIC_AGE_THRESHOLD || 18}+ to purchase. Valid date of birth required.` }, { status: 400 });
    }
    if (!complianceAccepted) {
      return NextResponse.json({ error: "You must accept the nicotine & age compliance declaration." }, { status: 400 });
    }
    if (!items?.length) return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    if (!shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.postcode) {
      return NextResponse.json({ error: "Complete shipping address required" }, { status: 400 });
    }

    const session = await getSession();
    const email = session ? undefined : guestEmail;
    if (!session && (!guestEmail || !guestEmail.includes("@"))) {
      return NextResponse.json({ error: "Guest email required" }, { status: 400 });
    }

    // --- Load variants & validate stock (no deduction yet — webhook does that) ---
    const ids = items.map((i) => i.variantId);
    const vars = await db.select().from(productVariants).where(inArray(productVariants.id, ids));
    if (vars.length !== ids.length) return NextResponse.json({ error: "One or more items no longer available" }, { status: 400 });
    const prodRows = await db.select().from(products);
    const prodMap = Object.fromEntries(prodRows.map((p) => [p.id, p]));

    let subtotal = 0;
    const lines: { variantId: string; quantity: number; unitPrice: number; productName: string; variantLabel: string; sku: string }[] = [];
    for (const it of items) {
      const v = vars.find((x) => x.id === it.variantId)!;
      if (!v.isActive) return NextResponse.json({ error: `Item ${v.sku} is unavailable` }, { status: 400 });
      const qty = Math.max(1, Math.min(99, parseInt(String(it.quantity), 10) || 1));
      if ((v.stockQuantity ?? 0) < qty) {
        return NextResponse.json({ error: `Insufficient stock for ${v.sku} (only ${v.stockQuantity} left)` }, { status: 400 });
      }
      const prod = prodMap[v.productId];
      const unit = parseFloat(v.priceOverride ?? prod?.basePrice ?? "0");
      subtotal += unit * qty;
      const label = [v.flavor, v.nicotineStrength, v.bottleSize, v.color].filter(Boolean).join(" · ");
      lines.push({
        variantId: v.id,
        quantity: qty,
        unitPrice: unit,
        productName: prod?.name || "Product",
        variantLabel: label,
        sku: v.sku,
      });
    }

    // --- Promo ---
    let discount = 0;
    let promoApplied: string | null = null;
    if (promoCode) {
      const pr = await db.select().from(promoCodes).where(eq(promoCodes.code, promoCode.toUpperCase().trim())).limit(1);
      if (pr.length && pr[0].isActive) {
        const p = pr[0];
        const expired = p.expiresAt && new Date(p.expiresAt) < new Date();
        const overLimit = p.usageLimit && (p.usedCount ?? 0) >= p.usageLimit;
        const minOk = parseFloat(p.minOrder ?? "0") <= subtotal;
        if (!expired && !overLimit && minOk) {
          const val = parseFloat(p.value ?? "0");
          discount = p.type === "percent" ? (subtotal * val) / 100 : Math.min(val, subtotal);
          discount = Number(discount.toFixed(2));
          promoApplied = p.code;
        }
      }
    }

    const rates = shippingRates(subtotal - discount);
    const ship = rates.find((r) => r.id === shippingMethod) || rates[0];
    const total = Number((subtotal - discount + ship.cost).toFixed(2));

    // --- Create order in pending state ---
    const gateway = getGatewayName();
    const inserted = await db.insert(orders).values({
      userId: session?.sub || null,
      guestEmail: email || null,
      status: "pending",
      subtotal: String(subtotal.toFixed(2)),
      discount: String(discount.toFixed(2)),
      shippingCost: String(ship.cost.toFixed(2)),
      totalAmount: String(total.toFixed(2)),
      shippingAddress: { ...shippingAddress, method: shippingMethod, dob },
      paymentGateway: gateway,
      paymentStatus: "pending",
      dobVerified: true,
      complianceAccepted: true,
      promoCode: promoApplied,
    }).returning();
    const order = inserted[0];

    for (const l of lines) {
      await db.insert(orderItems).values({
        orderId: order.id,
        variantId: l.variantId,
        productName: l.productName,
        variantLabel: l.variantLabel,
        sku: l.sku,
        quantity: l.quantity,
        unitPrice: String(l.unitPrice.toFixed(2)),
      });
    }

    // --- Create payment intent via modular gateway ---
    const intent = await createPaymentIntent({ amount: total, orderId: order.id, cardLast4 });
    await db.update(orders).set({ paymentIntentId: intent.intentId }).where(eq(orders.id, order.id));
    await db.insert(payments).values({
      orderId: order.id,
      gateway,
      intentId: intent.intentId,
      amount: String(total.toFixed(2)),
      status: "pending",
      raw: { intent } as Record<string, unknown>,
    });

    return NextResponse.json({
      orderId: order.id,
      total,
      subtotal,
      discount,
      shipping: ship,
      gateway: intent.gateway,
      paymentIntentId: intent.intentId,
      clientSecret: intent.clientSecret,
      redirectUrl: intent.redirectUrl,
      // In mock/sandbox the frontend immediately simulates the customer paying,
      // which fires the webhook that verifies + deducts stock.
      mockPayUrl: `/api/webhooks/payment?gateway=mock&orderId=${order.id}&intentId=${intent.intentId}`,
    });
  } catch (e) {
    console.error("checkout error", e);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
