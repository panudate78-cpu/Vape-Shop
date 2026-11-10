import { NextResponse } from 'next/server';
import { db } from '@/db';
import { productVariants, products, suppliers } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { changeStock, StockError, releaseExpiredReservations, rowsOf } from '@/lib/stock';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const REORDER_HORIZON_DAYS = 14; // stock to cover this many days beyond lead time

// GET → stock report: valuation, margin, low stock, reorder suggestions, expiring batches.
export async function GET() {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await releaseExpiredReservations().catch(() => {});

  const vars = await db.select({
    id: productVariants.id, sku: productVariants.sku, barcode: productVariants.barcode,
    flavor: productVariants.flavor, nicotine: productVariants.nicotineStrength, size: productVariants.bottleSize,
    stock: productVariants.stockQuantity, reserved: productVariants.reservedQuantity,
    threshold: productVariants.lowStockThreshold, unitCost: productVariants.unitCost,
    supplierId: productVariants.supplierId, priceOverride: productVariants.priceOverride,
    isActive: productVariants.isActive,
    productName: products.name, brand: products.brand, basePrice: products.basePrice, productCost: products.costPrice,
    supplierName: suppliers.name, leadTime: suppliers.leadTimeDays,
  }).from(productVariants)
    .leftJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(suppliers, eq(suppliers.id, productVariants.supplierId))
    .where(eq(productVariants.isActive, true));

  const sold = rowsOf(await db.execute(sql`
    SELECT oi.variant_id AS vid, SUM(oi.quantity)::int AS qty, SUM(oi.quantity * oi.unit_price)::numeric AS rev
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at > NOW() - INTERVAL '30 days' AND o.payment_status IN ('paid','refunded') AND o.status <> 'cancelled'
    GROUP BY oi.variant_id`));
  const onOrderRows = rowsOf(await db.execute(sql`
    SELECT l.variant_id AS vid, SUM(l.quantity_ordered - l.quantity_received)::int AS qty
    FROM purchase_order_lines l JOIN purchase_orders p ON p.id = l.po_id
    WHERE p.status IN ('sent','part_received') GROUP BY l.variant_id`));
  const expiring = rowsOf(await db.execute(sql`
    SELECT b.id, b.variant_id AS vid, b.batch_code, b.expiry_date, b.qty_remaining, p.name AS product_name, v.sku
    FROM stock_batches b JOIN product_variants v ON v.id = b.variant_id LEFT JOIN products p ON p.id = v.product_id
    WHERE b.qty_remaining > 0 AND NOT b.recalled AND b.expiry_date IS NOT NULL AND b.expiry_date <= to_char(CURRENT_DATE + 60, 'YYYY-MM-DD')
    ORDER BY b.expiry_date ASC`));

  const soldBy = new Map<number, { qty: number; rev: number }>(sold.map((r: any) => [Number(r.vid), { qty: Number(r.qty), rev: Number(r.rev) }]));
  const onOrderBy = new Map<number, number>(onOrderRows.map((r: any) => [Number(r.vid), Number(r.qty)]));

  let units = 0, valueCost = 0, valueRetail = 0;
  const rows = vars.map((v) => {
    const override = v.priceOverride != null ? Number(v.priceOverride) : NaN;
    const price = !isNaN(override) && override > 0 ? override : Number(v.basePrice ?? 0);
    const costSource = v.unitCost != null ? 'variant' : v.productCost != null ? 'product' : 'none';
    const cost = v.unitCost != null ? Number(v.unitCost) : Number(v.productCost ?? 0);
    const available = Math.max(0, v.stock - v.reserved);
    const s = soldBy.get(v.id) || { qty: 0, rev: 0 };
    const avgDaily = s.qty / 30;
    const leadTime = v.leadTime ?? 7;
    const onOrder = onOrderBy.get(v.id) || 0;
    const reorderPoint = Math.ceil(avgDaily * leadTime) + v.threshold;
    const target = Math.ceil(avgDaily * (leadTime + REORDER_HORIZON_DAYS)) + v.threshold;
    const suggestedReorder = available + onOrder <= reorderPoint ? Math.max(0, target - available - onOrder) : 0;
    units += v.stock;
    valueCost += v.stock * cost;
    valueRetail += v.stock * price;
    return {
      variantId: v.id, sku: v.sku, barcode: v.barcode,
      name: `${v.productName ?? ''} — ${[v.flavor, v.nicotine, v.size].filter(Boolean).join(' · ')}`,
      brand: v.brand, price, cost, costSource, marginPct: price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null,
      stock: v.stock, reserved: v.reserved, available, threshold: v.threshold,
      supplierId: v.supplierId, supplierName: v.supplierName, leadTime,
      sold30: s.qty, avgDaily: Math.round(avgDaily * 100) / 100, onOrder,
      lowStock: available <= v.threshold, reorderPoint, suggestedReorder,
      valueCost: Math.round(v.stock * cost * 100) / 100,
    };
  });

  const soldRev = [...soldBy.values()].reduce((x, y) => x + y.rev, 0);
  const soldCost = rows.reduce((x, r) => x + (soldBy.get(r.variantId)?.qty || 0) * r.cost, 0);

  return NextResponse.json({
    totals: {
      units, valueCost: Math.round(valueCost * 100) / 100, valueRetail: Math.round(valueRetail * 100) / 100,
      potentialMarginPct: valueRetail > 0 ? Math.round(((valueRetail - valueCost) / valueRetail) * 1000) / 10 : null,
      revenue30: Math.round(soldRev * 100) / 100,
      grossMargin30: Math.round((soldRev - soldCost) * 100) / 100,
      grossMarginPct30: soldRev > 0 ? Math.round(((soldRev - soldCost) / soldRev) * 1000) / 10 : null,
    },
    rows: rows.sort((x, y) => x.name.localeCompare(y.name)),
    lowStock: rows.filter((r) => r.lowStock).sort((x, y) => x.available - y.available),
    reorder: rows.filter((r) => r.suggestedReorder > 0).sort((x, y) => y.suggestedReorder - x.suggestedReorder),
    expiring: expiring.map((b: any) => ({ batchId: b.id, variantId: Number(b.vid), sku: b.sku, product: b.product_name, batchCode: b.batch_code, expiryDate: b.expiry_date, qtyRemaining: Number(b.qty_remaining) })),
  });
}

const adjustSchema = z.object({
  variantId: z.number().int().positive(),
  reason: z.enum(['delivery', 'damage', 'loss', 'return', 'correction']),
  quantity: z.number().int().positive().optional(),   // for delivery/damage/loss/return
  delta: z.number().int().optional(),                 // for correction: signed
  note: z.string().max(300).optional().default(''),
  batchCode: z.string().max(60).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  unitCost: z.number().min(0).optional(),
});

// POST → manual adjustment with a reason. Stock-count changes come from stocktakes.
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = adjustSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid adjustment', issues: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  let delta: number;
  if (d.reason === 'delivery' || d.reason === 'return') delta = Math.abs(d.quantity ?? 0);
  else if (d.reason === 'damage' || d.reason === 'loss') delta = -Math.abs(d.quantity ?? 0);
  else delta = d.delta ?? 0;
  if (!delta) return NextResponse.json({ error: 'Enter a quantity' }, { status: 400 });
  if ((d.reason === 'damage' || d.reason === 'loss' || d.reason === 'correction') && d.note.trim().length < 3) {
    return NextResponse.json({ error: 'Add a short note explaining this adjustment' }, { status: 400 });
  }
  try {
    const r = await changeStock({
      variantId: d.variantId, delta, reason: d.reason, actor: a.email,
      note: d.note.trim() || null, batchCode: d.batchCode || null, expiryDate: d.expiryDate || null, unitCost: d.unitCost ?? null,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof StockError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}

const variantPatch = z.object({
  variantId: z.number().int().positive(),
  unitCost: z.number().min(0).nullable().optional(),
  supplierId: z.number().int().positive().nullable().optional(),
});

// PATCH → supplier cost and preferred supplier for a variant (drives valuation & reorders).
export async function PATCH(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const p = variantPatch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const set: Record<string, any> = {};
  if (p.data.unitCost !== undefined) set.unitCost = p.data.unitCost == null ? null : p.data.unitCost.toFixed(2);
  if (p.data.supplierId !== undefined) set.supplierId = p.data.supplierId;
  if (Object.keys(set).length) await db.update(productVariants).set(set).where(eq(productVariants.id, p.data.variantId));
  return NextResponse.json({ ok: true });
}

