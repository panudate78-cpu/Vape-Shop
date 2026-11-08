import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, productVariants, products, categories, payments } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { z } from "zod";

const bodySchema = z.object({
  items: z.array(z.object({
    variantId: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })).min(1, "Add at least one item"),
  paymentMethod: z.enum(["cash", "card"]),
  staffNote: z.string().max(500).optional().default(""),
  discount: z.number().min(0).optional().default(0),
});

// Lazy-add the source/payment_method/staff_note columns if they don't exist yet
let ensuredCols = false;
async function ensurePosColumns() {
  if (ensuredCols) return;
  try {
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online'`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_note TEXT`);
    ensuredCols = true;
  } catch (e) {
    console.warn('[pos] could not add columns:', (e as Error).message);
  }
}

export async function GET() {
  // POS product picker: returns all active variants in a searchable shape
  // (product name + brand + variant label + SKU + price + stock)
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const rows = await db.select({
    variantId: productVariants.id,
    productId: productVariants.productId,
    sku: productVariants.sku,
    productName: products.name,
    brand: products.brand,
    categoryName: categories.name,
    flavor: productVariants.flavor,
    nicotine: productVariants.nicotineStrength,
    size: productVariants.bottleSize,
    color: productVariants.color,
    stock: productVariants.stockQuantity,
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

  return NextResponse.json({
    items: rows
      .filter((r) => r.isActive && r.productActive !== false && r.stock > 0)
      .map((r) => {
        const variantLabel = [r.flavor, r.nicotine, r.size, r.color].filter(Boolean).join(' · ') || 'Standard';
        const price = Number(r.priceOverride ?? r.basePrice ?? 0);
        return {
          variantId: r.variantId,
          productId: r.productId,
          sku: r.sku,
          name: r.productName,
          brand: r.brand || 'Other',
          category: r.categoryName || 'Other',
          variantLabel,
          image: Array.isArray(r.images) ? r.images[0] : null,
          stock: r.stock,
          price,
        };
      }),
  });
}

export async function POST(req: Request) {
  const a = await requireAdmin();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await ensurePosColumns();

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', issues: parsed.error.flatten() }, { status: 400 });
  const { items, paymentMethod, staffNote, discount } = parsed.data;

  // Load variants & stock-check
  const variantIds = items.map((i) => i.variantId);
  const variants = await db.select().from(productVariants).where(inArray(productVariants.id, variantIds));
  const prods = await db.select().from(products).where(inArray(products.id, variants.map((v) => v.productId)));
  const prodById = new Map(prods.map((p) => [p.id, p]));

  const lineItems: { variantId: number; productName: string; variantLabel: string; sku: string; quantity: number; unitPrice: number }[] = [];
  let subtotal = 0;
  for (const it of items) {
    const v = variants.find((x) => x.id === it.variantId);
    if (!v) return NextResponse.json({ error: `Variant ${it.variantId} not found` }, { status: 400 });
    if (v.stockQuantity < it.quantity) {
      const p = prodById.get(v.productId);
      return NextResponse.json({ error: `${p?.name} — only ${v.stockQuantity} in stock` }, { status: 409 });
    }
    const p = prodById.get(v.productId)!;
    const label = [v.flavor, v.nicotineStrength, v.bottleSize, v.color].filter(Boolean).join(' · ') || 'Standard';
    const price = Number(v.priceOverride ?? p.basePrice ?? 0);
    subtotal += price * it.quantity;
    lineItems.push({
      variantId: v.id,
      productName: p.name,
      variantLabel: label,
      sku: v.sku,
      quantity: it.quantity,
      unitPrice: price,
    });
  }
  const total = Math.max(0, subtotal - discount);

  // Create the POS order
  const [order] = await db.insert(orders).values({
    userId: null,
    guestEmail: null,
    status: 'collected', // in-store sale = already handed over
    subtotal: subtotal.toFixed(2),
    discount: discount.toFixed(2),
    shippingCost: '0.00',
    totalAmount: total.toFixed(2),
    shippingAddress: null,
    collectionMode: 'collect',
    paymentGateway: 'pos',
    paymentIntentId: `pos_${Date.now()}`,
    paymentStatus: 'paid',
    source: 'pos',
    paymentMethod,
    staffNote: staffNote || null,
    dobVerified: true, // assume staff ID'd customer at the till (Challenge 25)
    complianceAccepted: true,
  } as any).returning();

  await db.insert(orderItems).values(
    lineItems.map((li) => ({
      orderId: order.id,
      variantId: li.variantId,
      productName: li.productName,
      variantLabel: li.variantLabel,
      sku: li.sku,
      quantity: li.quantity,
      unitPrice: li.unitPrice.toFixed(2),
    }))
  );

  // Deduct stock
  for (const li of lineItems) {
    await db.update(productVariants)
      .set({ stockQuantity: sql`${productVariants.stockQuantity} - ${li.quantity}` })
      .where(eq(productVariants.id, li.variantId));
  }

  await db.insert(payments).values({
    orderId: order.id,
    gateway: 'pos',
    gatewayTransactionId: `pos_${paymentMethod}_${Date.now()}`,
    amount: total.toFixed(2),
    status: 'paid',
    raw: { paymentMethod, staffNote },
  });

  return NextResponse.json({ ok: true, orderId: order.id, total, subtotal, items: lineItems.length });
}
