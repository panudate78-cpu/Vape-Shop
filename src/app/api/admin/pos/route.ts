import { NextResponse } from "next/server";
import { recordTillRefund } from "@/lib/order-lifecycle";
import { db } from "@/db";
import { orders, orderItems, productVariants, products, categories, payments } from "@/db/schema";
import { eq, inArray, sql, and, gte } from "drizzle-orm";
import { requireStaff } from "@/lib/session";
import { can, authorise, actorName } from "@/lib/staff";
import { audit } from "@/lib/audit";
import { openShift } from "@/lib/cash";
import { ensurePosSchema } from "@/lib/pos-schema";
import { applyStockChange, releaseExpiredReservations, StockError } from "@/lib/stock";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Discount limits. Managers (ADMIN role) may give up to POS_MANAGER_CAP_PCT;
// other staff roles are capped at POS_STAFF_CAP_PCT. Scaffolding: today every
// till user is ADMIN, so the staff tier only applies once a lower role exists.
const MANAGER_CAP = Number(process.env.POS_MANAGER_CAP_PCT || 100);
const STAFF_CAP = Number(process.env.POS_STAFF_CAP_PCT || 15);
const capFor = (role: string) => (can(role, "discount.over_cap") ? MANAGER_CAP : STAFF_CAP);

// Lock the open shift for the duration of a sale so a cash-up cannot close it mid-sale.
async function lockOpenShift(tx: any, shiftId: number) {
  const rows: any = await tx.execute(sql`SELECT id FROM cash_shifts WHERE id = ${shiftId} AND status = 'open' FOR SHARE`);
  if (!rows.length) throw new Error("NO_SHIFT");
}

const lineSchema = z.object({
  variantId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  lineDiscountPct: z.number().min(0).max(100).optional(),
});

const bodySchema = z.object({
  items: z.array(lineSchema).min(1, "Add at least one item"),
  // cash | card (= card taken on an external terminal, recorded here) | split
  paymentMethod: z.enum(["cash", "card", "split"]),
  payments: z.array(z.object({ method: z.enum(["cash", "card"]), amount: z.number().positive() })).optional(),
  cashTendered: z.number().min(0).optional(),
  staffNote: z.string().max(500).optional().default(""),
  discount: z.number().min(0).optional().default(0),       // basket £ off (legacy field)
  discountPct: z.number().min(0).max(100).optional().default(0), // basket % off
  parentOrderId: z.number().int().positive().optional(),   // return / exchange against an earlier sale
  refundReason: z.string().max(200).optional(),
  refundReasonCode: z.enum(["damaged", "faulty", "wrong_item", "not_as_described", "changed_mind", "cancelled_order", "other"]).optional(),
  resellable: z.boolean().optional(),                      // returned goods go back on the shelf? (default yes)
  idempotencyKey: z.string().min(8).max(64).optional(),
  registerId: z.string().trim().min(1).max(40).optional(),   // which till rang the sale
  approverPin: z.string().regex(/^\d{4,6}$/).optional(),   // manager/owner PIN for an override the cashier cannot authorise
});

const toC = (n: number) => Math.round(n * 100);
const fromC = (c: number) => Number((c / 100).toFixed(2));

function variantLabel(v: { flavor: string | null; nicotineStrength: string | null; bottleSize: string | null; color: string | null }) {
  return [v.flavor, v.nicotineStrength, v.bottleSize, v.color].filter(Boolean).join(" · ") || "Standard";
}

export async function GET(req: Request) {
  // POS product picker: active variants in a searchable shape.
  // ?barcode=... returns a single exact barcode match (used by the scanner).
  const a = await requireStaff();
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensurePosSchema();

  const barcode = new URL(req.url).searchParams.get("barcode")?.trim() || "";

  const rows = await db.select({
    variantId: productVariants.id,
    productId: productVariants.productId,
    sku: productVariants.sku,
    barcode: productVariants.barcode,
    productName: products.name,
    brand: products.brand,
    categoryName: categories.name,
    flavor: productVariants.flavor,
    nicotine: productVariants.nicotineStrength,
    size: productVariants.bottleSize,
    color: productVariants.color,
    stock: productVariants.stockQuantity,
    reserved: productVariants.reservedQuantity,
    priceOverride: productVariants.priceOverride,
    basePrice: products.basePrice,
    isActive: productVariants.isActive,
    productActive: products.isActive,
    images: products.images,
  })
  .from(productVariants)
  .leftJoin(products, eq(products.id, productVariants.productId))
  .leftJoin(categories, eq(categories.id, products.categoryId))
  .orderBy(products.name);

  const shape = (r: (typeof rows)[number]) => {
    const override = r.priceOverride != null ? Number(r.priceOverride) : NaN;
    const price = !isNaN(override) && override > 0 ? override : Number(r.basePrice ?? 0);
    return {
      variantId: r.variantId,
      productId: r.productId,
      sku: r.sku,
      barcode: r.barcode || null,
      name: r.productName,
      brand: r.brand || "Other",
      category: r.categoryName || "Other",
      variantLabel: variantLabel({ flavor: r.flavor, nicotineStrength: r.nicotine, bottleSize: r.size, color: r.color }),
      image: Array.isArray(r.images) ? (r.images as string[])[0] : null,
      stock: Math.max(0, r.stock - r.reserved), // available to sell (held web checkouts excluded)
      price,
    };
  };

  if (barcode) {
    const hit = rows.find((r) => r.barcode === barcode && r.isActive && r.productActive !== false);
    if (!hit) return NextResponse.json({ error: `No product with barcode ${barcode}` }, { status: 404 });
    return NextResponse.json({ item: shape(hit) });
  }

  return NextResponse.json({
    discountCap: capFor(a.role),
    items: rows
      .filter((r) => r.isActive && r.productActive !== false && r.stock - r.reserved > 0)
      .map(shape),
  });
}

export async function POST(req: Request) {
  const a = await requireStaff();
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensurePosSchema();
  await releaseExpiredReservations().catch(() => {});

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const isReturn = !!body.parentOrderId;
  const cap = capFor(a.role);
  const register = (body.registerId || "Till 1").trim();
  const shift = await openShift(register);
  let overCap = false;

  // ---- Duplicate-click protection -------------------------------------------
  // With a client idempotency key: the same key always returns the same order.
  // Without one: an identical sale (same total + note) in the last 3 seconds is
  // treated as a double-click and the original order is returned.
  const intentId = body.idempotencyKey ? `pos_key_${body.idempotencyKey}` : null;
  if (intentId) {
    const [dup] = await db.select().from(orders).where(eq(orders.paymentIntentId, intentId)).limit(1);
    if (dup) return NextResponse.json({ ok: true, duplicate: true, orderId: dup.id, total: Number(dup.totalAmount) });
  }

  // ---- Returns / exchanges --------------------------------------------------
  if (isReturn) {
    if (!body.refundReason?.trim()) return NextResponse.json({ error: "A reason is required for a return." }, { status: 400 });
    if (body.paymentMethod === "split") return NextResponse.json({ error: "Refund to one method (cash or card)." }, { status: 400 });
    const refundAuth = await authorise(a, "refund", body.approverPin);
    if (!refundAuth.ok) return NextResponse.json({ error: refundAuth.error, code: refundAuth.code }, { status: refundAuth.status });
    if (body.paymentMethod === "cash" && !shift) return NextResponse.json({ error: `Open ${register} with a float before paying cash out.`, code: "NO_SHIFT" }, { status: 409 });
    const [orig] = await db.select().from(orders).where(eq(orders.id, body.parentOrderId!)).limit(1);
    if (!orig) return NextResponse.json({ error: "Original sale not found" }, { status: 404 });
    if (orig.status === "cancelled") return NextResponse.json({ error: "Original sale was cancelled" }, { status: 409 });

    const origLines = await db.select().from(orderItems).where(eq(orderItems.orderId, orig.id));
    const priorReturns = await db.select({ id: orders.id }).from(orders).where(eq(orders.parentOrderId, orig.id));
    const priorLines = priorReturns.length
      ? await db.select().from(orderItems).where(inArray(orderItems.orderId, priorReturns.map((r) => r.id)))
      : [];

    // Pro-rata share of any basket-level discount so refunds match what was paid.
    const linesGross = origLines.reduce((sum, l) => sum + toC(Number(l.unitPrice)) * l.quantity, 0);
    const ratio = linesGross > 0 ? toC(Number(orig.totalAmount)) / linesGross : 1;

    let refundC = 0;
    const recLines: { orderItemId: number; variantId: number | null; quantity: number; amountC: number }[] = [];
    const retLines: { variantId: number; productName: string; variantLabel: string; sku: string; quantity: number; unitPrice: number }[] = [];
    for (const it of body.items) {
      const ol = origLines.find((l) => l.variantId === it.variantId);
      if (!ol) return NextResponse.json({ error: `Variant ${it.variantId} was not on the original sale` }, { status: 400 });
      const alreadyBack = priorLines.filter((l) => l.variantId === it.variantId).reduce((sum, l) => sum - l.quantity, 0);
      const sold = origLines.filter((l) => l.variantId === it.variantId).reduce((sum, l) => sum + l.quantity, 0);
      if (it.quantity > sold - alreadyBack) {
        return NextResponse.json({ error: `${ol.productName} — only ${sold - alreadyBack} left to return` }, { status: 400 });
      }
      const unitC = Math.round(toC(Number(ol.unitPrice)) * ratio);
      refundC += unitC * it.quantity;
      recLines.push({ orderItemId: ol.id, variantId: it.variantId, quantity: it.quantity, amountC: unitC * it.quantity });
      retLines.push({ variantId: it.variantId, productName: ol.productName, variantLabel: ol.variantLabel, sku: ol.sku, quantity: -it.quantity, unitPrice: fromC(unitC) });
    }

    const refund = fromC(refundC);
    const saleKey = intentId ? body.idempotencyKey! : crypto.randomUUID();
    const approvedBy = refundAuth.approver.id !== a.id ? actorName(refundAuth.approver) : null;
    try {
      const ret = await db.transaction(async (tx) => {
        if (shift && body.paymentMethod === "cash") await lockOpenShift(tx, shift.id);
        const [r] = await tx.insert(orders).values({
          userId: null, guestEmail: null, status: "refunded", fulfilmentStatus: "collected",
          subtotal: fromC(-refundC).toFixed(2), discount: "0.00", shippingCost: "0.00",
          totalAmount: fromC(-refundC).toFixed(2),
          collectionMode: "collect", paymentGateway: "pos",
          paymentIntentId: intentId || `pos_${saleKey}`,
          paymentStatus: "refunded", source: "pos",
          paymentMethod: `refund_${body.paymentMethod}`,
          staffNote: body.staffNote || null,
          parentOrderId: orig.id, refundReason: body.refundReason!.trim(),
          dobVerified: true, complianceAccepted: true,
          staffUserId: a.id, staffName: actorName(a), registerId: register, shiftId: shift?.id ?? null, approvedBy,
        } as any).returning();
        await tx.insert(orderItems).values(retLines.map((l) => ({ orderId: r.id, ...l, unitPrice: l.unitPrice.toFixed(2) })));
        for (const l of retLines) {
          if (body.resellable === false) break; // not resellable: the goods leave stock; nothing goes back on the shelf
          // Goods coming back: +stock, ledger reason "return".
          await applyStockChange(tx, {
            variantId: l.variantId, delta: -l.quantity, reason: "return", actor: a.email,
            orderId: r.id, note: `Return against sale #${orig.id}: ${body.refundReason!.trim()}`,
            refKey: `return:${orig.id}:${saleKey}:${l.variantId}`,
          });
        }
        await recordTillRefund(tx, {
          originalOrderId: orig.id, returnOrderId: r.id, amountC: refundC, method: body.paymentMethod,
          reasonCode: body.refundReasonCode || "other", reasonNote: body.refundReason!.trim(),
          resellable: body.resellable !== false, actor: actorName(a),
          lines: recLines,
        });
        await tx.insert(payments).values({
          orderId: r.id, gateway: "pos", gatewayTransactionId: `pos_refund_${body.paymentMethod}_${saleKey}`,
          amount: (-refund).toFixed(2), status: "refunded", raw: { parentOrderId: orig.id, refundReason: body.refundReason },
        });
        return r;
      });
      await audit(a, "refund.create", "order", ret.id, {
        parentOrderId: orig.id, refund, method: body.paymentMethod, reason: body.refundReason!.trim(),
        lines: retLines.map((l) => ({ sku: l.sku, quantity: -l.quantity, unitPrice: l.unitPrice })),
        approvedBy: approvedBy ?? undefined, authorisedBy: refundAuth.approver.id,
      }, register);
      return NextResponse.json({ ok: true, orderId: ret.id, total: -refund, refund, items: retLines.length, parentOrderId: orig.id });
    } catch (e) {
      if (e instanceof StockError) return NextResponse.json({ error: e.message }, { status: 409 });
      if (e instanceof Error && e.message === "NO_SHIFT") return NextResponse.json({ error: `${register} was closed mid-refund. Reopen the till and try again.`, code: "NO_SHIFT" }, { status: 409 });
      throw e;
    }
  }

  // ---- Normal sale ----------------------------------------------------------
  const variantIds = body.items.map((i) => i.variantId);
  const variants = await db.select().from(productVariants).where(inArray(productVariants.id, variantIds));
  const prods = await db.select().from(products).where(inArray(products.id, variants.map((v) => v.productId)));
  const prodById = new Map(prods.map((p) => [p.id, p]));

  const lineItems: { variantId: number; productName: string; variantLabel: string; sku: string; quantity: number; unitPrice: number; lineC: number; grossC: number }[] = [];
  let grossC = 0;
  let lineDiscC = 0;
  for (const it of body.items) {
    const v = variants.find((x) => x.id === it.variantId);
    if (!v) return NextResponse.json({ error: `Variant ${it.variantId} not found` }, { status: 400 });
    const available = v.stockQuantity - v.reservedQuantity;
    if (available < it.quantity) {
      const p = prodById.get(v.productId);
      return NextResponse.json({ error: `${p?.name} — only ${Math.max(0, available)} available` }, { status: 409 });
    }
    const pct = it.lineDiscountPct ?? 0;
    if (pct > cap) overCap = true;   // needs manager approval (checked below)
    const p = prodById.get(v.productId)!;
    const override = v.priceOverride != null ? Number(v.priceOverride) : NaN;
    const unitC = toC(!isNaN(override) && override > 0 ? override : Number(p.basePrice ?? 0));
    const discPerUnit = Math.round(unitC * pct / 100);
    const unitAfterC = unitC - discPerUnit;
    grossC += unitC * it.quantity;
    lineDiscC += discPerUnit * it.quantity;
    lineItems.push({
      variantId: v.id, productName: p.name, variantLabel: variantLabel(v), sku: v.sku,
      quantity: it.quantity, unitPrice: fromC(unitAfterC),
      lineC: unitAfterC * it.quantity, grossC: unitC * it.quantity,
    });
  }
  const afterLinesC = grossC - lineDiscC;

  // Basket discount: % of the post-line subtotal plus optional flat £ (legacy).
  const basketPctC = Math.round(afterLinesC * body.discountPct / 100);
  const flatC = Math.min(toC(body.discount), afterLinesC - basketPctC);
  const totalDiscC = lineDiscC + basketPctC + flatC;
  const totalC = Math.max(0, grossC - totalDiscC);
  if (grossC > 0 && (totalDiscC / grossC) * 100 > cap + 1e-9) overCap = true;
  let discountApprover: { id: number; name: string } | null = null;
  if (overCap) {
    const discAuth = await authorise(a, "discount.over_cap", body.approverPin);
    if (!discAuth.ok) return NextResponse.json({ error: `Discount is above your ${cap}% limit. ${discAuth.error}`, code: discAuth.code }, { status: discAuth.status });
    if (discAuth.approver.id !== a.id) discountApprover = { id: discAuth.approver.id, name: actorName(discAuth.approver) };
  }

  // Payment split
  let paymentParts: { method: "cash" | "card"; amount: number }[];
  if (body.paymentMethod === "split") {
    if (!body.payments || body.payments.length < 2) return NextResponse.json({ error: "Split payment needs at least two parts." }, { status: 400 });
    paymentParts = body.payments.map((p) => ({ method: p.method, amount: fromC(toC(p.amount)) }));
    const sumC = paymentParts.reduce((s, p) => s + toC(p.amount), 0);
    if (sumC !== totalC) return NextResponse.json({ error: `Split parts total ${gbpStr(sumC)} but basket is ${gbpStr(totalC)}` }, { status: 400 });
  } else {
    paymentParts = [{ method: body.paymentMethod, amount: fromC(totalC) }];
  }

  let cashTenderedC: number | null = null;
  let changeC: number | null = null;
  const cashPartC = paymentParts.filter((p) => p.method === "cash").reduce((s, p) => s + toC(p.amount), 0);
  if (cashPartC > 0 && body.cashTendered != null) {
    cashTenderedC = toC(body.cashTendered);
    if (cashTenderedC < cashPartC) return NextResponse.json({ error: `Cash received ${gbpStr(cashTenderedC)} is less than the cash due ${gbpStr(cashPartC)}` }, { status: 400 });
    changeC = cashTenderedC - cashPartC;
  }

  // Duplicate fallback for clients without an idempotency key (3s window)
  if (!intentId) {
    const [recent] = await db.select().from(orders).where(and(
      eq(orders.source, "pos"),
      eq(orders.totalAmount, fromC(totalC).toFixed(2)),
      gte(orders.createdAt, sql`NOW() - INTERVAL '3 seconds'`),
    )).limit(1);
    if (recent) return NextResponse.json({ ok: true, duplicate: true, orderId: recent.id, total: Number(recent.totalAmount) });
  }

  if (cashPartC > 0 && !shift) {
    return NextResponse.json({ error: `Open ${register} with a float before taking cash.`, code: "NO_SHIFT" }, { status: 409 });
  }
  const saleKey = intentId ? body.idempotencyKey! : crypto.randomUUID();
  const primary = body.paymentMethod === "split" ? "split" : body.paymentMethod;
  try {
    const order = await db.transaction(async (tx) => {
      if (shift && cashPartC > 0) await lockOpenShift(tx, shift.id);
      const [o] = await tx.insert(orders).values({
        userId: null,
        guestEmail: null,
        status: "collected", // in-store sale = already handed over
        fulfilmentStatus: "collected",
        subtotal: fromC(grossC).toFixed(2),
        discount: fromC(totalDiscC).toFixed(2),
        shippingCost: "0.00",
        totalAmount: fromC(totalC).toFixed(2),
        shippingAddress: null,
        collectionMode: "collect",
        paymentGateway: "pos",
        paymentIntentId: intentId || `pos_${saleKey}`,
        paymentStatus: "paid",
        source: "pos",
        paymentMethod: primary,
        paymentBreakdown: body.paymentMethod === "split" ? paymentParts.map((p) => ({ method: p.method, amount: p.amount })) : null,
        cashTendered: cashTenderedC != null ? fromC(cashTenderedC).toFixed(2) : null,
        changeGiven: changeC != null ? fromC(changeC).toFixed(2) : null,
        staffNote: body.staffNote || null,
        dobVerified: true, // assume staff ID'd customer at the till (Challenge 25)
        staffUserId: a.id, staffName: actorName(a), registerId: register, shiftId: shift?.id ?? null,
        approvedBy: discountApprover?.name ?? null,
        complianceAccepted: true,
      } as any).returning();

      await tx.insert(orderItems).values(
        lineItems.map((li) => ({
          orderId: o.id, variantId: li.variantId, productName: li.productName, variantLabel: li.variantLabel,
          sku: li.sku, quantity: li.quantity, unitPrice: li.unitPrice.toFixed(2),
        }))
      );

      // Stock out via the shared ledger. Throws (and rolls back the whole sale) if
      // another sale or a web checkout took the last unit in the meantime.
      for (const li of lineItems) {
        await applyStockChange(tx, {
          variantId: li.variantId, delta: -li.quantity, reason: "sale_till", actor: a.email,
          orderId: o.id, refKey: `sale:till:${saleKey}:${li.variantId}`,
        });
      }

      await tx.insert(payments).values(paymentParts.map((p) => ({
        orderId: o.id,
        gateway: "pos",
        gatewayTransactionId: `pos_${p.method}_${saleKey}_${p.method}`,
        amount: p.amount.toFixed(2),
        status: "paid",
        raw: { paymentMethod: p.method, staffNote: body.staffNote, recordedOnly: p.method === "card" },
      })));
      return o;
    });

    if (totalDiscC > 0) {
      await audit(a, overCap ? "discount.override" : "discount.apply", "order", order.id, {
        discount: fromC(totalDiscC), basketPct: body.discountPct, lineDiscounts: body.items.filter((i) => (i.lineDiscountPct ?? 0) > 0).map((i) => ({ variantId: i.variantId, pct: i.lineDiscountPct })),
        approvedBy: discountApprover?.name ?? null, total: fromC(totalC),
      }, register);
    }
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      staff: actorName(a), register,
      total: fromC(totalC),
      subtotal: fromC(grossC),
      discount: fromC(totalDiscC),
      change: changeC != null ? fromC(changeC) : 0,
      items: lineItems.length,
    });
  } catch (e) {
    if (e instanceof StockError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof Error && e.message === "NO_SHIFT") return NextResponse.json({ error: `${register} was closed mid-sale. Reopen the till and try again.`, code: "NO_SHIFT" }, { status: 409 });
    throw e;
  }
}

function gbpStr(c: number) { return `£${(c / 100).toFixed(2)}`; }
