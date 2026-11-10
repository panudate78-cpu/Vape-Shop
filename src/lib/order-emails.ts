// Kept for existing callers. Confirmations and admin alerts are queued in the payment
// transaction (see lib/stock.ts) and delivered from the outbox, so this only triggers delivery.
import { deliverNotifications } from '@/lib/order-events';

export async function sendOrderEmailsForOrder(orderId: number) {
  return deliverNotifications(orderId);
}
