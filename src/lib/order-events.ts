// Order history and customer/staff notifications.
//
// - recordEvent: append-only, timestamped history for an order (who did what, when).
// - queueNotification: writes an outbox row. The unique dedupe_key means a repeated
//   payment webhook or status change can never queue the same email twice.
// - deliverNotifications: claims each pending/failed row atomically, sends it, and
//   records the outcome. Failed rows stay queued and are retried by the next delivery
//   pass or by the admin "retry" action.
import { db } from '@/db';
import { orders, orderItems, orderEvents, users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { sendEmail, buildCustomerConfirmation, buildAdminNewOrderAlert, buildCollectionReady, adminRecipients, type OrderEmailData } from '@/lib/email';

export type EventKind =
  | 'placed' | 'payment_paid' | 'payment_failed' | 'payment_rejected' | 'payment_duplicate'
  | 'fulfilment' | 'tracking' | 'refund' | 'notification';

export async function recordEvent(tx: any, orderId: number, kind: EventKind | string, actor: string | null, detail?: Record<string, unknown>) {
  await (tx ?? db).insert(orderEvents).values({ orderId, kind, actor, detail: (detail ?? null) as any });
}

// Queue an email. Safe to call repeatedly: the second call with the same key does nothing.
export async function queueNotification(tx: any, p: { orderId: number; kind: 'order_confirmation' | 'admin_new_order' | 'collection_ready'; recipient: string; dedupeKey: string }) {
  await (tx ?? db).execute(sql`
    INSERT INTO notifications (order_id, kind, recipient, dedupe_key, status)
    VALUES (${p.orderId}, ${p.kind}, ${p.recipient || ''}, ${p.dedupeKey}, 'pending')
    ON CONFLICT (dedupe_key) DO NOTHING`);
}

async function loadEmailData(orderId: number): Promise<OrderEmailData | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  let customerName: string | null = null;
  let customerEmail = order.guestEmail || '';
  if (order.userId) {
    const [u] = await db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, order.userId)).limit(1);
    if (u) { customerEmail = u.email; customerName = u.fullName ?? null; }
  }
  return {
    id: order.id,
    subtotal: order.subtotal,
    discount: order.discount,
    shippingCost: order.shippingCost,
    totalAmount: order.totalAmount,
    collectionMode: (order.collectionMode || 'delivery') as 'delivery' | 'collect',
    shippingAddress: (order.shippingAddress as OrderEmailData['shippingAddress']) || null,
    isGuest: !order.userId,
    promoCode: order.promoCode,
    customerEmail,
    customerName,
    items: items.map((i) => ({ productName: i.productName, variantLabel: i.variantLabel, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice })),
    createdAt: order.createdAt,
    paymentGateway: order.paymentGateway,
  };
}

// Claim and send every pending/failed notification for this order.
// A row claimed as 'sending' by another request is skipped, unless it has been stuck for 5 minutes.
export async function deliverNotifications(orderId: number): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  const rows = (await db.execute<any>(sql`
    SELECT id FROM notifications
    WHERE order_id = ${orderId}
      AND (status IN ('pending', 'failed') OR (status = 'sending' AND updated_at < NOW() - INTERVAL '5 minutes'))
    ORDER BY id`)) as any;
  const ids: number[] = ((rows?.rows ?? rows) as any[]).map((r) => Number(r.id));
  if (!ids.length) return out;

  const data = await loadEmailData(orderId);
  for (const id of ids) {
    const claimed = (await db.execute<any>(sql`
      UPDATE notifications SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
      WHERE id = ${id}
        AND (status IN ('pending', 'failed') OR (status = 'sending' AND updated_at < NOW() - INTERVAL '5 minutes'))
      RETURNING id, kind, recipient, attempts`)) as any;
    const row = ((claimed?.rows ?? claimed) as any[])[0];
    if (!row) { out.skipped++; continue; }

    try {
      if (!data) throw new Error('order not found');
      let ok = false; let error = '';
      if (row.kind === 'order_confirmation' || row.kind === 'collection_ready') {
        if (!row.recipient) { await mark(id, 'skipped', 'no customer email on order'); out.skipped++; continue; }
        const tpl = row.kind === 'order_confirmation' ? buildCustomerConfirmation(data) : buildCollectionReady(data);
        const res = await sendEmail({
          to: { email: row.recipient, name: data.customerName || undefined },
          subject: tpl.subject, html: tpl.html, text: tpl.text,
          replyTo: process.env.EMAIL_REPLY_TO || undefined,
        });
        ok = res.ok; error = res.error || '';
      } else if (row.kind === 'admin_new_order') {
        const to = adminRecipients();
        if (!to.length) { await mark(id, 'skipped', 'EMAIL_ADMIN_ALERTS_TO not set'); out.skipped++; continue; }
        const tpl = buildAdminNewOrderAlert(data);
        const res = await sendEmail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
        ok = res.ok; error = res.error || '';
      } else {
        await mark(id, 'skipped', `unknown kind ${row.kind}`); out.skipped++; continue;
      }
      if (ok) { await db.execute(sql`UPDATE notifications SET status = 'sent', sent_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = ${id}`); out.sent++; }
      else { await mark(id, 'failed', error || 'send failed'); out.failed++; }
    } catch (e: any) {
      await mark(id, 'failed', e?.message || 'send failed'); out.failed++;
    }
  }
  return out;
}

async function mark(id: number, status: 'failed' | 'skipped', error: string) {
  await db.execute(sql`UPDATE notifications SET status = ${status}, last_error = ${error.slice(0, 500)}, updated_at = NOW() WHERE id = ${id}`);
}

export async function notificationsFor(orderId: number) {
  const rows = (await db.execute<any>(sql`
    SELECT id, kind, recipient, status, attempts, last_error, sent_at, created_at
    FROM notifications WHERE order_id = ${orderId} ORDER BY id`)) as any;
  return (rows?.rows ?? rows) as any[];
}

// Retry everything that is still pending or failed (used by the admin "retry" action).
export async function retryFailedNotifications(): Promise<{ orders: number; sent: number; failed: number }> {
  const rows = (await db.execute<any>(sql`
    SELECT DISTINCT order_id FROM notifications
    WHERE status IN ('pending', 'failed') OR (status = 'sending' AND updated_at < NOW() - INTERVAL '5 minutes')
    ORDER BY order_id LIMIT 200`)) as any;
  const ids: number[] = ((rows?.rows ?? rows) as any[]).map((r) => Number(r.order_id));
  let sent = 0, failed = 0;
  for (const id of ids) { const r = await deliverNotifications(id); sent += r.sent; failed += r.failed; }
  return { orders: ids.length, sent, failed };
}

export { loadEmailData };
