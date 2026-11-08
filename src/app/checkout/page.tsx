'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/format';

type Item = { variantId: number; quantity: number; productName: string; variantLabel: string; unitPrice: number; sku: string };
export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [mode, setMode] = useState<'delivery' | 'collect'>('delivery');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [line1, setLine1] = useState(''); const [line2, setLine2] = useState(''); const [city, setCity] = useState('Chessington'); const [postcode, setPostcode] = useState(''); const [county, setCounty] = useState('Surrey');
  const [dob, setDob] = useState(''); const [compliance, setCompliance] = useState(false);
  const [promo, setPromo] = useState(''); const [discount, setDiscount] = useState(0); const [shipping, setShipping] = useState(0);
  const [promoErr, setPromoErr] = useState<string | null>(null); const [promoApplied, setPromoApplied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const [cardNum, setCardNum] = useState('4242 4242 4242 4242'); const [cardExp, setCardExp] = useState('12/30'); const [cardCvc, setCardCvc] = useState('123');

  const load = async () => {
    const r = await fetch('/api/cart/resolve', { cache: 'no-store' });
    const d = await r.json();
    setItems(d.items); setSubtotal(d.subtotal);
    recalcShipping(d.subtotal, mode);
  };
  const recalcShipping = (sub: number, m: 'delivery' | 'collect') => {
    const baseShip = m === 'collect' ? 0 : (sub >= 30 ? 0 : 3.99);
    setShipping(Math.max(0, baseShip - (promoApplied && promoApplied === 'FREESHIP' ? 100 : 0)));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { recalcShipping(subtotal, mode); }, [mode, subtotal, promoApplied]);

  const applyPromo = async () => {
    setPromoErr(null);
    const r = await fetch('/api/promos/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: promo, subtotal }) });
    const d = await r.json();
    if (!r.ok) { setPromoErr(d.error); setDiscount(0); setPromoApplied(null); return; }
    setDiscount(d.discount); setPromoApplied(d.code);
    if (d.type === 'shipping') recalcShipping(subtotal, mode);
  };

  const place = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setLoading(true);
    const body: any = { mode, dob, compliance, promoCode: promoApplied || null, email };
    if (mode === 'delivery') body.shippingAddress = { line1, line2, city, postcode, county };
    const r = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { setErr(d.error || 'Could not place order'); setLoading(false); return; }
    // mock capture
    const cap = await fetch(`/api/checkout/${d.orderId}/capture`, { method: 'POST' });
    const cd = await cap.json();
    setLoading(false);
    if (!cap.ok) { setErr(cd.error || 'Payment failed'); return; }
    router.push(`/order/${d.orderId}`);
  };

  const total = Math.max(0, subtotal + shipping - discount);
  if (items.length === 0) return <div className="card text-center py-16"><p className="text-zinc-400">Your cart is empty.</p><a href="/shop" className="btn-primary mt-4 inline-block">Shop now</a></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold">Checkout</h1>
      <form onSubmit={place} className="grid md:grid-cols-[1fr_360px] gap-6 mt-6">
        <div className="space-y-6">
          <div className="card space-y-3">
            <h2 className="font-bold">Collection method</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className={`border rounded-lg p-3 cursor-pointer ${mode === 'delivery' ? 'border-teal-400 bg-teal-500/10' : 'border-zinc-700'}`}>
                <input type="radio" name="mode" checked={mode === 'delivery'} onChange={() => setMode('delivery')} className="mr-2" /> Delivery
                <p className="text-xs text-zinc-400 mt-1">£3.99, free over £30</p>
              </label>
              <label className={`border rounded-lg p-3 cursor-pointer ${mode === 'collect' ? 'border-teal-400 bg-teal-500/10' : 'border-zinc-700'}`}>
                <input type="radio" name="mode" checked={mode === 'collect'} onChange={() => setMode('collect')} className="mr-2" /> Click & Collect
                <p className="text-xs text-zinc-400 mt-1">Free — Bridge Road, Chessington</p>
              </label>
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">Contact</h2>
            <div><label className="label">Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            {mode === 'delivery' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="label">Recipient name</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="col-span-2"><label className="label">Address line 1</label><input className="input" required value={line1} onChange={(e) => setLine1(e.target.value)} /></div>
                <div className="col-span-2"><label className="label">Address line 2 (optional)</label><input className="input" value={line2} onChange={(e) => setLine2(e.target.value)} /></div>
                <div><label className="label">Town/City</label><input className="input" required value={city} onChange={(e) => setCity(e.target.value)} /></div>
                <div><label className="label">County</label><input className="input" value={county} onChange={(e) => setCounty(e.target.value)} /></div>
                <div className="col-span-2"><label className="label">Postcode</label><input className="input" required value={postcode} onChange={(e) => setPostcode(e.target.value)} /></div>
              </div>
            )}
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">Age verification</h2>
            <p className="text-sm text-zinc-400">UK law requires customers to be 18 or over. Enter your date of birth.</p>
            <div><label className="label">Date of birth</label><input className="input" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} /></div>
            <label className="flex gap-2 text-sm items-start">
              <input type="checkbox" className="mt-1" checked={compliance} onChange={(e) => setCompliance(e.target.checked)} required />
              <span>I confirm I am aged 18 or over, that the information provided is correct, and I understand nicotine products are addictive. I may be asked for ID on collection/delivery (Challenge 25).</span>
            </label>
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">Payment (mock/test mode)</h2>
            <p className="text-xs text-zinc-400">PAYMENT_GATEWAY is set to <code>mock</code> — no real card is charged. Use 4242… for testing.</p>
            <div><label className="label">Card number</label><input className="input" value={cardNum} onChange={(e) => setCardNum(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Expiry (MM/YY)</label><input className="input" value={cardExp} onChange={(e) => setCardExp(e.target.value)} /></div>
              <div><label className="label">CVC</label><input className="input" value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} /></div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card space-y-2">
            <h2 className="font-bold">Order summary</h2>
            <ul className="divide-y divide-zinc-800 text-sm">
              {items.map((i) => (
                <li key={i.variantId} className="py-2 flex justify-between gap-2">
                  <div>
                    <div className="font-medium">{i.productName}</div>
                    <div className="text-xs text-zinc-400">{i.variantLabel} × {i.quantity}</div>
                  </div>
                  <div>{formatPrice(i.unitPrice * i.quantity)}</div>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-2">
              <input className="input" placeholder="Promo code" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} />
              <button type="button" onClick={applyPromo} className="btn-outline">Apply</button>
            </div>
            {promoErr && <p className="text-xs text-red-400">{promoErr}</p>}
            {promoApplied && <p className="text-xs text-teal-300">Code {promoApplied} applied.</p>}
            <div className="border-t border-zinc-800 pt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
              <div className="flex justify-between"><span>Shipping</span><span>{shipping === 0 ? 'Free' : formatPrice(shipping)}</span></div>
              {discount > 0 && <div className="flex justify-between text-teal-300"><span>Discount</span><span>-{formatPrice(discount)}</span></div>}
              <div className="flex justify-between font-bold text-lg pt-1 border-t border-zinc-800"><span>Total</span><span className="text-teal-400">{formatPrice(total)}</span></div>
            </div>
            {err && <div className="text-red-400 text-sm">{err}</div>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? 'Processing…' : `Pay ${formatPrice(total)}`}</button>
            <p className="text-[11px] text-zinc-500 text-center">By paying you confirm you are 18+. In-store Challenge 25 applies.</p>
          </div>
        </aside>
      </form>
    </div>
  );
}
