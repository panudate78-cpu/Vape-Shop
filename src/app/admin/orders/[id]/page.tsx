'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { gbp } from '@/lib/format';
import { customerLabel, sourceBadge } from '@/lib/admin-helpers';

const REASONS = [
  ['damaged', 'Damaged'], ['faulty', 'Faulty / not working'], ['wrong_item', 'Wrong item sent'],
  ['not_as_described', 'Not as described'], ['changed_mind', 'Changed mind'], ['cancelled_order', 'Order cancelled'], ['other', 'Other (add a note)'],
];
const field = 'rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white w-full';
const label = 'block text-xs font-bold text-zinc-300 mb-1';

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function newKey() {
  return 'rf-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const PAY_LABEL: Record<string, string> = { pending: 'Unpaid', paid: 'Paid', failed: 'Payment failed', partially_refunded: 'Part refunded', refunded: 'Refunded' };
const FUL_LABEL: Record<string, string> = { unfulfilled: 'Not started', processing: 'Processing', ready: 'Ready to collect', shipped: 'Shipped', delivered: 'Delivered', collected: 'Collected', cancelled: 'Cancelled' };

function describe(ev: any): string {
  const d = ev.detail || {};
  switch (ev.kind) {
    case 'placed': return 'Order placed';
    case 'payment_paid': return `Payment received ${d.amount != null ? gbp(d.amount) : ''}`.trim();
    case 'payment_failed': return 'Payment failed (gateway notification)';
    case 'payment_duplicate': return 'Repeat payment notification ignored (already paid)';
    case 'payment_rejected': return `Payment rejected: ${d.reason === 'amount_mismatch' ? `amount ${d.received} did not match ${d.expected}` : (d.message || d.reason || 'see details')}`;
    case 'fulfilment': return `${FUL_LABEL[d.from] || d.from} → ${FUL_LABEL[d.to] || d.to}${d.reason ? ` (${d.reason})` : ''}${d.collectedBy ? ` · collected by ${d.collectedBy}, ID checked` : ''}${d.trackingNumber ? ` · tracking ${d.trackingNumber}` : ''}`;
    case 'tracking': return `Tracking updated${d.trackingNumber ? ` · ${d.trackingNumber}` : ''}${d.carrier ? ` (${d.carrier})` : ''}`;
    case 'refund': return `Refund ${gbp(d.amount)} · ${d.reason || d.reasonCode}${d.reasonNote ? ` — ${d.reasonNote}` : ''} · ${d.method}${d.resolution === 'exchange' ? ` · exchange with sale #${d.replacementOrderId}` : ''}`;
    default: return ev.kind;
  }
}

export default function AdminOrderDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [tracking, setTracking] = useState('');
  const [carrier, setCarrier] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [idChecked, setIdChecked] = useState(false);
  // Refund form
  const [qty, setQty] = useState<Record<number, number>>({});
  const [restock, setRestock] = useState<Record<number, boolean>>({});
  const [includeShipping, setIncludeShipping] = useState(false);
  const [reasonCode, setReasonCode] = useState('changed_mind');
  const [reasonNote, setReasonNote] = useState('');
  const [resolution, setResolution] = useState<'refund' | 'exchange'>('refund');
  const [replacementId, setReplacementId] = useState('');
  const [method, setMethod] = useState<'original' | 'cash' | 'card' | 'manual'>('original');
  const [refundKey, setRefundKey] = useState(newKey());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await fetch(`/api/admin/orders/${params.id}`, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) { setMsg({ text: d.error || 'Could not load order', kind: 'err' }); return; }
    setData(d);
    setTracking(d.order.trackingNumber || '');
    setCarrier(d.order.carrier || '');
  };
  useEffect(() => { load(); }, [params.id]);

  if (!data) return <div className="text-zinc-400 py-10 text-center">{msg?.text || 'Loading…'}</div>;
  const { order, items, refunds, events, notifications } = data;
  const isPos = order.source === 'pos';
  const isCollect = order.collectionMode === 'collect';
  const fs: string = order.fulfilmentStatus || 'unfulfilled';
  const ps: string = order.paymentStatus;
  const paid = ps === 'paid' || ps === 'partially_refunded';
  const remainingItems = items.map((i: any) => ({ ...i, remaining: i.quantity - (i.refundedQuantity || 0) }));
  const shippingLeft = Number(order.shippingCost) > 0 && !refunds.some((r: any) => r.includeShipping);
  const refundable = paid && !isPos && remainingItems.some((i: any) => i.remaining > 0) || (paid && !isPos && shippingLeft);

  const act = async (body: any, okText: string) => {
    setMsg(null); setBusy(true);
    try {
      const r = await fetch(`/api/admin/orders/${params.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ text: d.error || 'Could not save', kind: 'err' }); return false; }
      setMsg({ text: okText, kind: 'ok' });
      await load();
      return true;
    } finally { setBusy(false); }
  };

  const refund = async () => {
    setMsg(null);
    const lines = remainingItems
      .filter((i: any) => (qty[i.id] || 0) > 0)
      .map((i: any) => ({ orderItemId: i.id, quantity: qty[i.id], restock: restock[i.id] ?? true }));
    if (!lines.length && !includeShipping) { setMsg({ text: 'Choose items or shipping to refund.', kind: 'err' }); return; }
    if (reasonCode === 'other' && !reasonNote.trim()) { setMsg({ text: 'Add a note for "Other".', kind: 'err' }); return; }
    if (resolution === 'exchange' && !replacementId.trim()) { setMsg({ text: 'Enter the replacement sale number for an exchange.', kind: 'err' }); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/orders/${params.id}/refunds`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          refundKey, lines, includeShipping, reasonCode, reasonNote: reasonNote.trim() || null, resolution,
          replacementOrderId: resolution === 'exchange' ? Number(replacementId) : null, method,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ text: d.error || 'Refund failed', kind: 'err' }); return; }
      setMsg({ text: `Refunded ${gbp(d.amount)}.${d.gatewayNote ? ' ' + d.gatewayNote : ''}`, kind: 'ok' });
      setQty({}); setIncludeShipping(false); setReasonNote(''); setRefundKey(newKey());
      await load();
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setBusy(true);
    const r = await fetch('/api/admin/notifications/retry', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg({ text: r.ok ? `Emails retried: ${d.sent ?? 0} sent, ${d.failed ?? 0} still failing.` : (d.error || 'Retry failed'), kind: r.ok ? 'ok' : 'err' });
    load();
  };

  const nextButtons: { to: string; text: string; needs?: string }[] = [];
  if (fs === 'unfulfilled') nextButtons.push({ to: 'processing', text: 'Start processing' });
  if (fs === 'processing' && isCollect) nextButtons.push({ to: 'ready', text: 'Mark ready for collection' });
  if (fs === 'processing' && !isCollect) nextButtons.push({ to: 'shipped', text: 'Mark shipped', needs: 'tracking' });
  if (fs === 'shipped') nextButtons.push({ to: 'delivered', text: 'Mark delivered' });
  if (fs === 'ready') nextButtons.push({ to: 'collected', text: 'Hand over to customer', needs: 'handover' });
  if ((fs === 'unfulfilled' || fs === 'processing' || fs === 'ready') && !paid) nextButtons.push({ to: 'cancelled', text: 'Cancel order' });

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-amber-400">Order #{order.id}</h1>
          {sourceBadge(order)}
          <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-bold text-zinc-200">Payment: {PAY_LABEL[ps] || ps}</span>
          <span className="rounded-full bg-sky-900/50 px-2.5 py-0.5 text-xs font-bold text-sky-200">Fulfilment: {FUL_LABEL[fs] || fs}</span>
        </div>
        <button className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/5" onClick={() => router.back()}>Back</button>
      </div>

      {msg && <div className={`rounded-xl px-4 py-2 text-sm font-bold ${msg.kind === 'ok' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'}`}>{msg.text}</div>}

      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div><span className={label}>Customer</span><div className="text-white font-semibold">{customerLabel(order)}</div>{order.customerEmail && <div className="text-zinc-400">{order.customerEmail}</div>}</div>
        <div><span className={label}>Placed</span><span className="text-zinc-200">{fmt(order.createdAt)}</span></div>
        <div><span className={label}>Channel</span>{isPos ? <span className="text-zinc-200">In store · {order.registerId || 'till'} · {order.staffName || 'staff'}</span> : <span className="text-zinc-200">Online · {isCollect ? 'click & collect' : 'delivery'}</span>}</div>
        <div><span className={label}>Payment method</span><span className="text-zinc-200">{isPos ? (order.paymentMethod || 'in store') : (order.paymentGateway || '—')}</span></div>
        <div><span className={label}>Promo</span><span className="text-zinc-200">{order.promoCode || '—'}</span></div>
        <div><span className={label}>Total</span><span className="text-amber-400 font-black text-lg">{gbp(order.totalAmount)}</span>{Number(order.refundedAmount) > 0 && <span className="ml-2 text-amber-300">refunded {gbp(order.refundedAmount)}</span>}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-3">
          <h2 className="font-extrabold text-white">Fulfilment</h2>
          <p className="text-xs text-zinc-500">Payment and fulfilment are separate. Payment is changed only by payments and refunds.</p>
          {!paid && ps !== 'refunded' && <p className="rounded-xl bg-amber-900/30 px-3 py-2 text-xs text-amber-200">Not paid yet ({PAY_LABEL[ps] || ps}). Goods cannot be handed over until payment is received.</p>}
          <div className="flex flex-wrap gap-2">
            {nextButtons.map((b) => (
              <button key={b.to} disabled={busy}
                onClick={() => {
                  if (b.to === 'cancelled' && !confirm('Cancel this order? Held stock will be released.')) return;
                  if (b.to === 'collected' && (!collectedBy.trim() || !idChecked)) { setMsg({ text: 'Enter the collector name and tick "ID checked" first.', kind: 'err' }); return; }
                  act({
                    fulfilmentStatus: b.to,
                    trackingNumber: tracking || null, carrier: carrier || null,
                    ...(b.to === 'collected' ? { collectedBy: collectedBy.trim(), idChecked: true } : {}),
                  }, `Order moved to ${FUL_LABEL[b.to] || b.to}.`);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-extrabold disabled:opacity-60 ${b.to === 'cancelled' ? 'border border-red-400/40 text-red-200 hover:bg-red-900/30' : 'bg-amber-400 text-black hover:bg-amber-300'}`}>
                {b.text}
              </button>
            ))}
            {!nextButtons.length && <span className="text-sm text-zinc-400">No further steps.</span>}
          </div>

          {(fs === 'processing' || fs === 'shipped' || fs === 'delivered' || order.trackingNumber) && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div><label className={label}>Tracking number</label><input className={field} value={tracking} onChange={(e) => setTracking(e.target.value)} /></div>
              <div><label className={label}>Carrier</label><input className={field} value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Royal Mail / DPD / Evri" /></div>
              <div className="col-span-2"><button disabled={busy} onClick={() => act({ trackingNumber: tracking || null, carrier: carrier || null }, 'Tracking saved.')} className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/5">Save tracking</button></div>
            </div>
          )}

          {fs === 'ready' && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <p className="text-sm font-bold text-white">Handover</p>
              <input className={field} placeholder="Name of person collecting" value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)} />
              <label className="flex items-center gap-2 text-sm text-zinc-200"><input type="checkbox" checked={idChecked} onChange={(e) => setIdChecked(e.target.checked)} /> Photo ID checked (Challenge 25)</label>
            </div>
          )}

          {order.collectedBy && <p className="text-sm text-zinc-300">Collected by <b>{order.collectedBy}</b> · ID checked · {order.collectedAt ? fmt(order.collectedAt) : ''}</p>}
          {order.trackingNumber && <p className="text-sm text-zinc-300">Tracking <span className="font-mono text-white">{order.trackingNumber}</span>{order.carrier ? ` · ${order.carrier}` : ''}{order.deliveredAt ? ` · delivered ${fmt(order.deliveredAt)}` : order.shippedAt ? ` · shipped ${fmt(order.shippedAt)}` : ''}</p>}
          <div className="pt-2 text-sm text-zinc-300">
            <span className={label}>{isCollect ? 'Collection' : 'Delivery address'}</span>
            {isCollect ? <p>Customer collects in store. Photo ID required.</p> : (
              <address className="not-italic text-zinc-200">{order.shippingAddress ? [order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.postcode].filter(Boolean).map((l: string, i: number) => <div key={i}>{l}</div>) : 'No address on file.'}</address>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-3">
          <h2 className="font-extrabold text-white">Items</h2>
          <ul className="divide-y divide-white/10 text-sm">
            {items.map((i: any) => (
              <li key={i.id} className="py-2 flex justify-between gap-3">
                <div><div className="font-semibold text-white">{i.productName}</div><div className="text-xs text-zinc-400">{i.variantLabel} · {i.sku} × {i.quantity}{i.refundedQuantity ? <span className="text-amber-300"> · {i.refundedQuantity} refunded</span> : null}</div></div>
                <div className="font-bold text-white">{gbp(Number(i.unitPrice) * i.quantity)}</div>
              </li>
            ))}
          </ul>
          <div className="border-t border-white/10 pt-2 space-y-1 text-sm text-right">
            <div className="text-zinc-400">Subtotal <span className="text-white ml-2">{gbp(order.subtotal)}</span></div>
            <div className="text-zinc-400">Shipping <span className="text-white ml-2">{Number(order.shippingCost) === 0 ? 'Free' : gbp(order.shippingCost)}</span></div>
            {Number(order.discount) > 0 && <div className="text-amber-300">Discount <span className="ml-2">−{gbp(order.discount)}</span></div>}
            <div className="text-amber-400 font-black">Total {gbp(order.totalAmount)}</div>
          </div>
        </section>
      </div>

      {!isPos && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-4">
          <h2 className="font-extrabold text-white">Refund or exchange</h2>
          {!refundable ? (
            <p className="text-sm text-zinc-400">{isPos ? 'In-store sales are refunded from the Till.' : !paid ? 'Only paid orders can be refunded.' : 'Everything on this order has already been refunded.'}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-zinc-500"><tr><th className="py-2">Item</th><th>Left to refund</th><th>Refund qty</th><th>Goods</th></tr></thead>
                  <tbody>
                    {remainingItems.map((i: any) => (
                      <tr key={i.id} className="border-t border-white/5">
                        <td className="py-2 text-white">{i.productName} <span className="text-xs text-zinc-400">{i.variantLabel}</span></td>
                        <td className="text-zinc-300">{i.remaining}</td>
                        <td><input type="number" min={0} max={i.remaining} disabled={i.remaining < 1} value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Math.min(i.remaining, Number(e.target.value) || 0)) })} className={`${field} w-24`} /></td>
                        <td><label className="flex items-center gap-2 text-zinc-200"><input type="checkbox" checked={restock[i.id] ?? true} onChange={(e) => setRestock({ ...restock, [i.id]: e.target.checked })} /> Resellable (back in stock)</label></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {shippingLeft && <label className="flex items-center gap-2 text-sm text-zinc-200"><input type="checkbox" checked={includeShipping} onChange={(e) => setIncludeShipping(e.target.checked)} /> Refund delivery charge ({gbp(order.shippingCost)})</label>}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div><label className={label}>Reason</label><select className={field} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>{REASONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
                <div className="md:col-span-2"><label className={label}>Note {reasonCode === 'other' ? '(required)' : '(optional)'}</label><input className={field} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} maxLength={300} placeholder="e.g. arrived with cracked tank" /></div>
                <div><label className={label}>Outcome</label><select className={field} value={resolution} onChange={(e) => setResolution(e.target.value as any)}><option value="refund">Refund</option><option value="exchange">Exchange</option></select></div>
                {resolution === 'exchange' && <div><label className={label}>Replacement sale number</label><input className={field} inputMode="numeric" value={replacementId} onChange={(e) => setReplacementId(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 52" /></div>}
                <div><label className={label}>Money goes back by</label><select className={field} value={method} onChange={(e) => setMethod(e.target.value as any)}><option value="original">Original payment method</option><option value="cash">Cash</option><option value="card">Card (manual)</option><option value="manual">Other / recorded only</option></select></div>
              </div>
              {order.paymentGateway && order.paymentGateway !== 'mock' && method === 'original' && <p className="text-xs text-amber-200">Card refunds are not sent automatically yet. Complete the refund in the payment provider dashboard as well.</p>}
              <div className="flex items-center gap-3">
                <button disabled={busy} onClick={refund} className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">{busy ? 'Recording…' : 'Record refund'}</button>
                <span className="text-xs text-zinc-500">Each attempt has its own key, so a double-click cannot refund twice.</span>
              </div>
            </>
          )}
          {refunds.length > 0 && (
            <div className="border-t border-white/10 pt-3 space-y-2">
              <h3 className="text-sm font-bold text-white">Refund records</h3>
              {refunds.map((r: any) => (
                <div key={r.id} className="rounded-xl bg-zinc-950 px-3 py-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-2"><span className="text-white font-bold">{gbp(r.amount)} · {REASONS.find(([v]) => v === r.reasonCode)?.[1] || r.reasonCode}</span><span className="text-xs text-zinc-400">{fmt(r.createdAt)} · {r.createdBy || 'staff'}</span></div>
                  {r.reasonNote && <div className="text-zinc-300">“{r.reasonNote}”</div>}
                  <div className="text-xs text-zinc-400">{r.lines.map((l: any) => `${items.find((i: any) => i.id === l.orderItemId)?.productName ?? 'Item'} ×${l.quantity} ${l.restock ? '(restocked)' : '(not resellable)'}`).join(' · ')}{r.includeShipping ? ' · incl. delivery' : ''} · paid back by {r.method}{r.resolution === 'exchange' ? ` · exchanged for sale #${r.replacementOrderId}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h2 className="font-extrabold text-white mb-3">History</h2>
          <ol className="space-y-3 text-sm">
            {events.map((ev: any) => (
              <li key={ev.id} className="border-l-2 border-amber-400/60 pl-3">
                <div className="text-xs text-zinc-500">{fmt(ev.at)} · {ev.actor || 'system'}</div>
                <div className="text-zinc-100">{describe(ev)}</div>
              </li>
            ))}
            {!events.length && <li className="text-zinc-500">No history yet.</li>}
          </ol>
        </section>
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-extrabold text-white">Emails</h2>
            <button disabled={busy} onClick={resend} className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/5 disabled:opacity-60">Retry pending emails</button>
          </div>
          <ul className="space-y-2 text-sm">
            {notifications.map((n: any) => (
              <li key={n.id} className="flex justify-between gap-3">
                <span className="text-zinc-200">{({ order_confirmation: 'Order confirmation', admin_new_order: 'Shop alert', collection_ready: 'Ready to collect' } as any)[n.kind] || n.kind}</span>
                <span className={`text-xs font-bold ${n.status === 'sent' ? 'text-emerald-300' : n.status === 'failed' ? 'text-red-300' : 'text-zinc-400'}`}>
                  {n.status}{n.status === 'sent' && n.sent_at ? ` · ${fmt(n.sent_at)}` : ''}{n.last_error && n.status !== 'sent' ? ` · ${n.last_error}` : ''}
                </span>
              </li>
            ))}
            {!notifications.length && <li className="text-zinc-500">No emails queued.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
