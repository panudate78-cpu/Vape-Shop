import React from 'react';

/**
 * Returns a human customer label: name > email > "Guest".
 * Never falls back to `Account #${userId}` — that produced "Account #null"
 * on guest checkouts and was never informative anyway.
 */
export function customerLabel(o: { customerName?: string | null; customerEmail?: string | null; guestEmail?: string | null; userId?: any } | null | undefined): string {
  if (!o) return 'Guest';
  const name = (o.customerName || '').trim();
  if (name) return name;
  const email = (o.customerEmail || o.guestEmail || '').trim();
  if (email) return email;
  return 'Guest';
}

export type OrderLike = {
  source?: string | null;
  paymentMethod?: string | null;
  collectionMode?: string | null;
  fulfillmentMode?: string | null;
};

/**
 * Renders a coloured pill distinguishing order channel:
 *   - IN-STORE · CASH/CARD  (amber)  — POS/till sales
 *   - CLICK & COLLECT      (sky)    — online orders picked up in-store
 *   - DELIVERY             (emerald)— online orders shipped/delivered
 */
export function sourceBadge(o: OrderLike): React.ReactNode {
  const src = String(o.source || 'online').toLowerCase();
  const pay = String(o.paymentMethod || '').toLowerCase();
  if (src === 'pos') {
    const label = pay === 'cash' ? 'IN-STORE · CASH'
               : pay === 'card' ? 'IN-STORE · CARD'
               : pay ? `IN-STORE · ${pay.toUpperCase()}`
               : 'IN-STORE';
    return <span className="rounded-full bg-amber-400 text-black px-2 py-0.5 text-[10px] font-black whitespace-nowrap">{label}</span>;
  }
  const mode = String(o.collectionMode || o.fulfillmentMode || 'delivery').toLowerCase();
  if (mode === 'collect') {
    return <span className="rounded-full bg-sky-500/90 text-white px-2 py-0.5 text-[10px] font-black whitespace-nowrap">CLICK &amp; COLLECT</span>;
  }
  return <span className="rounded-full bg-emerald-500/90 text-white px-2 py-0.5 text-[10px] font-black whitespace-nowrap">DELIVERY</span>;
}
