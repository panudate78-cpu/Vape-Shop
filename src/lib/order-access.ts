// Who may see an order.
//  - the signed-in customer who placed it;
//  - the browser that placed it as a guest (the order id is in the session, set at checkout);
//  - staff (ADMIN / MANAGER).
// Knowing an order number is not enough. A guest on another device uses /track (order number + email).
type SessionLike = { user?: { id: number; role: string } | null; pendingOrderIds?: number[] | null };
type OrderLike = { id: number; userId: number | null };

export function canViewOrder(s: SessionLike, order: OrderLike): boolean {
  if (s.user && (s.user.role === 'ADMIN' || s.user.role === 'MANAGER')) return true;
  if (order.userId != null && s.user?.id === order.userId) return true;
  return (s.pendingOrderIds ?? []).includes(order.id);
}

// The part of an order a customer may see when tracking it with order number + email.
// Deliberately excludes payment identifiers, addresses and internal fields.
export function trackingView(o: {
  id: number; status: string; paymentStatus: string; fulfilmentStatus: string | null;
  collectionMode: string | null; subtotal: string | null; discount: string | null; shippingCost: string | null;
  totalAmount: string | null; trackingNumber: string | null; createdAt: Date | string | null;
}, items: { productName: string; variantLabel: string | null; quantity: number; unitPrice: string | null }[]) {
  return {
    order: {
      id: o.id, status: o.status, paymentStatus: o.paymentStatus, fulfilmentStatus: o.fulfilmentStatus,
      collectionMode: o.collectionMode, subtotal: o.subtotal, discount: o.discount, shippingCost: o.shippingCost,
      totalAmount: o.totalAmount, trackingNumber: o.trackingNumber, createdAt: o.createdAt,
    },
    items: items.map((i) => ({
      productName: i.productName, variantLabel: i.variantLabel, quantity: i.quantity, unitPrice: i.unitPrice,
    })),
  };
}
