'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { gbp } from '@/lib/format';

type Data = {
  order: {
    id: number; status: string; createdAt: string; subtotal: number; discount: number; total: number;
    paymentMethod: string | null; paymentBreakdown: { method: string; amount: number }[] | null;
    cashTendered: number | null; changeGiven: number | null; parentOrderId: number | null;
    refundReason: string | null; staffNote: string | null; receiptEmailedTo: string | null;
  };
  lines: { id: number; productName: string; variantLabel: string; sku: string; quantity: number; unitPrice: number }[];
  payments: { amount: number; method: string | null }[];
  returns: { id: number; total: number; createdAt: string }[];
};

// 80mm thermal receipt. Print styles below hide everything but .receipt.
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/pos/orders/${id}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Could not load receipt');
      else setData(j);
    }).catch(() => setErr('Network error'));
  }, [id]);

  useEffect(() => {
    if (data && search.get('print') === '1') setTimeout(() => window.print(), 300);
  }, [data, search]);

  const sendEmail = async () => {
    setSending(true); setEmailMsg('');
    const r = await fetch(`/api/admin/pos/orders/${id}/email`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
    });
    const j = await r.json();
    setSending(false);
    setEmailMsg(r.ok ? `Receipt sent to ${email}` : (j.error || 'Failed to send'));
  };

  if (err) return <div className="p-8 text-red-400">{err}</div>;
  if (!data) return <div className="p-8 text-zinc-400">Loading receipt…</div>;
  const o = data.order;
  const isRefund = o.total < 0;

  return (
    <div className="mx-auto max-w-[80mm]">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .receipt, .receipt * { visibility: visible !important; }
          .receipt { position: absolute; left: 0; top: 0; width: 72mm; color: #000 !important; background: #fff !important; }
          .no-print { display: none !important; }
          @page { size: 80mm auto; margin: 4mm; }
        }
        .receipt { font-family: 'Courier New', monospace; font-size: 12px; background: #fff; color: #000; padding: 12px; }
        .receipt table { width: 100%; border-collapse: collapse; }
        .receipt .r { text-align: right; }
        .receipt hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
      `}</style>

      <div className="receipt">
        <div style={{ textAlign: 'center', fontWeight: 700 }}>VAPE CLUB 100</div>
        <div style={{ textAlign: 'center' }}>{isRefund ? 'REFUND RECEIPT' : 'RECEIPT'}</div>
        <div style={{ textAlign: 'center' }}>#{o.id} · {new Date(o.createdAt).toLocaleString('en-GB')}</div>
        {o.parentOrderId && <div style={{ textAlign: 'center' }}>Against sale #{o.parentOrderId}</div>}
        <hr />
        <table>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.productName}<br />
                  <span style={{ fontSize: 10 }}>{l.variantLabel} · {l.sku}</span><br />
                  <span>{Math.abs(l.quantity)} x {gbp(l.unitPrice)}</span>
                </td>
                <td className="r">{gbp(l.unitPrice * l.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />
        <table>
          <tbody>
            <tr><td>Subtotal</td><td className="r">{gbp(o.subtotal)}</td></tr>
            {o.discount > 0 && <tr><td>Discount</td><td className="r">-{gbp(o.discount)}</td></tr>}
            <tr style={{ fontWeight: 700, fontSize: 14 }}><td>TOTAL</td><td className="r">{gbp(o.total)}</td></tr>
          </tbody>
        </table>
        <hr />
        <div>Paid by: {o.paymentBreakdown?.length
          ? o.paymentBreakdown.map((p) => `${p.method} ${gbp(p.amount)}`).join(' + ')
          : (o.paymentMethod || '—').replace('refund_', 'Refund to ')}</div>
        {o.cashTendered != null && <div>Cash tendered: {gbp(o.cashTendered)}</div>}
        {o.changeGiven != null && o.changeGiven > 0 && <div>Change: {gbp(o.changeGiven)}</div>}
        {o.refundReason && <div>Reason: {o.refundReason}</div>}
        <hr />
        <div style={{ textAlign: 'center' }}>Thank you — keep this receipt for returns.</div>
        <div style={{ textAlign: 'center', fontSize: 10 }}>Returns within 14 days with receipt.</div>
      </div>

      <div className="no-print mt-4 space-y-3">
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex-1 rounded-xl bg-amber-400 py-3 font-black text-black">🖨 {search.get('print') === '1' ? 'Print again' : 'Print receipt'}</button>
          <Link href="/admin/pos" className="flex-1 rounded-xl border border-white/20 py-3 text-center font-bold text-white">← Back to till</Link>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900 p-3">
          <p className="text-xs font-bold text-zinc-300">Email this receipt</p>
          <div className="mt-2 flex gap-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" className="input flex-1 !bg-zinc-800 !border-zinc-700 !text-white text-sm" />
            <button onClick={sendEmail} disabled={sending || !email} className="rounded-lg bg-zinc-700 px-3 text-sm font-bold text-white disabled:opacity-50">{sending ? 'Sending…' : 'Send'}</button>
          </div>
          {o.receiptEmailedTo && !emailMsg && <p className="mt-2 text-[11px] text-zinc-500">Last emailed to {o.receiptEmailedTo}</p>}
          {emailMsg && <p className="mt-2 text-xs font-bold text-emerald-300">{emailMsg}</p>}
        </div>
      </div>
    </div>
  );
}
