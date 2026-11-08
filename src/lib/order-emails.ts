/**
 * Helper: fetch an order + its items in the shape sendOrderEmails() expects,
 * then dispatch emails (idempotent — only sends once per order, using a
 * raw SQL column `emails_sent_at` added lazily on first use).
 */
import { db } from '@/db';
import { orders, orderItems, users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { sendOrderEmails, type OrderEmailData } from '@/lib/email';

let ensuredColumn = false;
async function ensureEmailsColumn() {
  if (ensuredColumn) return;
  try {
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS emails_sent_at TIMESTAMP`);
    ensuredColumn = true;
  } catch (e) {
    console.warn('[order-emails] could not add emails_sent_at column (will retry):', (e as Error).message);
  }
}

async function wasEmailSent(orderId: number): Promise<boolean> {
  const res = await db.execute<{ emails_sent_at: Date | null }>(
    sql`SELECT emails_sent_at FROM orders WHERE id = ${orderId}`,
  );
  const rows = (res as any)?.rows ?? [];
  return !!rows[0]?.emails_sent_at;
}

async function markEmailSent(orderId: number) {
  await db.execute(
    sql`UPDATE orders SET emails_sent_at = NOW(), updated_at = NOW() WHERE id = ${orderId}`,
  );
}

export async function sendOrderEmailsForOrder(orderId: number) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { skipped: 'order not found' };
  if (order.paymentStatus !== 'paid') return { skipped: 'not paid' };

  await ensureEmailsColumn();
  if (await wasEmailSent(orderId)) return { skipped: 'already sent' };

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  let customerName: string | null = null;
  let customerEmail = order.guestEmail || '';
  if (order.userId) {
    const [u] = await db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, order.userId)).limit(1);
    if (u) { customerEmail = u.email; customerName = u.fullName ?? null; }
  }

  const data: OrderEmailData = {
    id: order.id,
    subtotal: order.subtotal,
    discount: order.discount,
    shippingCost: order.shippingCost,
    totalAmount: order.totalAmount,
    collectionMode: (order.collectionMode || 'delivery') as 'delivery' | 'collect',
    shippingAddress: (order.shippingAddress as OrderEmailData['shippingAddress']) || null,
    promoCode: order.promoCode,
    customerEmail,
    customerName,
    items: items.map((i) => ({
      productName: i.productName,
      variantLabel: i.variantLabel,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
    createdAt: order.createdAt,
    paymentGateway: order.paymentGateway,
  };

  if (!customerEmail) {
    console.warn('[order-emails] No customer email for order', orderId, '— skipping customer email.');
  }

  const result = await sendOrderEmails(data);
  await markEmailSent(orderId);
  return result;
}
