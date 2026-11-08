'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { gbp } from '@/lib/format';
import { useStore } from '@/lib/store';

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, cartSubtotal, clearCart } = useStore();
  const [mode, setMode] = useState<'delivery' | 'collect'>('delivery');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('Chessington');
  const [postcode, setPostcode] = useState('');
  const [county, setCounty] = useState('Surrey');
  const [dob, setDob] = useState('');
  const [compliance, setCompliance] = useState(false);
  const [promo, setPromo] = useState('');
  const [discount, setDiscount] = useState(0);
  const [promoErr, setPromoErr] = useState<string | null>(null);
  const [promoApplied, setPromoApplied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cardNum, setCardNum] = useState('4242 4242 4242 4242');
  const [cardExp, setCardExp] = useState('12/30');
  const [cardCvc, setCardCvc] = useState('123');

  // Build the order items directly from the client store (single source of truth with the drawer).
  const items = useMemo(() => cart.map((l) => ({
    variantId: Number(l.variantId),
    quantity: l.quantity,
    productName: l.name,
    variantLabel: l.variantLabel,
    unitPrice: l.unitPrice,
    sku: l.sku,
  })).filter((l) => !isNaN(l.variantId)), [cart]);

  const subtotal = cartSubtotal;
  const shipping = useMemo(() => {
    if (mode === 'collect') return 0;
    const free = subtotal >= 30;
    if (free) return 0;
    let ship = 3.99;
    if (promoApplied === 'FREESHIP') ship = Math.max(0, ship - 100);
    return ship;
  }, [subtotal, mode, promoApplied]);
  const total = Math.max(0, subtotal + shipping - discount);

  useEffect(() => {
    // No items -> push back to shop
    if (items.length === 0 && !loading) {
      router.replace('/shop');
    }
  }, [items.length, loading, router]);

  const applyPromo = async () => {
    setPromoErr(null);
    const r = await fetch('/api/promos/validate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: promo, subtotal }),
    });
    const d = await r.json();
    if (!r.ok) { setPromoErr(d.error); setDiscount(0); setPromoApplied(null); return; }
    setDiscount(d.discount); setPromoApplied(d.code);
  };

  const place = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      const body: any = { mode, dob, compliance, promoCode: promoApplied || null, email };
      if (mode === 'delivery') body.shippingAddress = { line1, line2, city, postcode, county };
      const r = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Could not place order'); return; }
      const cap = await fetch(`/api/checkout/${d.orderId}/capture`, { method: 'POST' });
      const cd = await cap.json();
      if (!cap.ok) { setErr(cd.error || 'Payment failed'); return; }
      // Payment confirmed — clear the client-side cart (localStorage + drawer) AND server cart
      clearCart();
      await fetch('/api/cart', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: [] }) });
      router.push(`/order/${d.orderId}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0 && !loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white text-center py-16">
      <p className="text-slate-500">Your cart is empty.</p>
      <a href="/shop" className="rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold px-4 py-2 mt-4 inline-block">Shop now</a>
    </div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-3xl font-black text-slate-900">Checkout</h1>
      <form onSubmit={place} className="grid md:grid-cols-[1fr_360px] gap-6 mt-6">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="font-extrabold text-slate-900">Collection method</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className={`rounded-xl border p-4 cursor-pointer transition ${mode === 'delivery' ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-teal-500'}`}>
                <input type="radio" name="mode" className="mr-2" checked={mode === 'delivery'} onChange={() => setMode('delivery')} />
                <span className="font-bold text-slate-900">Delivery</span>
                <p className="text-xs text-slate-500 mt-1">£3.99, free over £30</p>
              </label>
              <label className={`rounded-xl border p-4 cursor-pointer transition ${mode === 'collect' ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-teal-500'}`}>
                <input type="radio" name="mode" className="mr-2" checked={mode === 'collect'} onChange={() => setMode('collect')} />
                <span className="font-bold text-slate-900">Click & Collect</span>
                <p className="text-xs text-slate-500 mt-1">Free — Bridge Road, Chessington</p>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="font-extrabold text-slate-900">Contact</h2>
            <div><label className="block text-xs font-bold text-slate-700 mb-1">Email</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            {mode === 'delivery' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="block text-xs font-bold text-slate-700 mb-1">Recipient name</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" required value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="col-span-2"><label className="block text-xs font-bold text-slate-700 mb-1">Address line 1</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" required value={line1} onChange={(e) => setLine1(e.target.value)} /></div>
                <div className="col-span-2"><label className="block text-xs font-bold text-slate-700 mb-1">Address line 2 (optional)</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" value={line2} onChange={(e) => setLine2(e.target.value)} /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Town/City</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" required value={city} onChange={(e) => setCity(e.target.value)} /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">County</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" value={county} onChange={(e) => setCounty(e.target.value)} /></div>
                <div className="col-span-2"><label className="block text-xs font-bold text-slate-700 mb-1">Postcode</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" required value={postcode} onChange={(e) => setPostcode(e.target.value)} /></div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="font-extrabold text-slate-900">Age verification</h2>
            <p className="text-sm text-slate-500">UK law requires customers to be 18 or over. Enter your date of birth.</p>
            <div><label className="block text-xs font-bold text-slate-700 mb-1">Date of birth</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} /></div>
            <label className="flex gap-2 text-sm items-start">
              <input type="checkbox" className="mt-1 accent-teal-500" checked={compliance} onChange={(e) => setCompliance(e.target.checked)} required />
              <span className="text-slate-700">I confirm I am aged 18 or over, that the information provided is correct, and I understand nicotine products are addictive. I may be asked for ID on collection/delivery (Challenge 25).</span>
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="font-extrabold text-slate-900">Payment (mock/test mode)</h2>
            <p className="text-xs text-slate-500">PAYMENT_GATEWAY is set to <code className="text-teal-700">mock</code> — no real card is charged. Use 4242… for testing.</p>
            <div><label className="block text-xs font-bold text-slate-700 mb-1">Card number</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" value={cardNum} onChange={(e) => setCardNum(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-bold text-slate-700 mb-1">Expiry (MM/YY)</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" value={cardExp} onChange={(e) => setCardExp(e.target.value)} /></div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1">CVC</label><input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm w-full text-slate-900 outline-none" value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} /></div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="font-extrabold text-slate-900">Order summary</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {items.map((i) => (
                <li key={i.variantId} className="py-2 flex justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">{i.productName}</div>
                    <div className="text-xs text-slate-500">{i.variantLabel} × {i.quantity}</div>
                  </div>
                  <div className="text-slate-900 font-semibold">{gbp(i.unitPrice * i.quantity)}</div>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-2">
              <input className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none" placeholder="Promo code" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} />
              <button type="button" onClick={applyPromo} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100">Apply</button>
            </div>
            {promoErr && <p className="text-xs text-red-400">{promoErr}</p>}
            {promoApplied && <p className="text-xs text-teal-700">Code {promoApplied} applied.</p>}
            <div className="border-t border-slate-200 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-700"><span>Subtotal</span><span>{gbp(subtotal)}</span></div>
              <div className="flex justify-between text-slate-700"><span>Shipping</span><span>{shipping === 0 ? 'Free' : gbp(shipping)}</span></div>
              {discount > 0 && <div className="flex justify-between text-teal-700"><span>Discount</span><span>-{gbp(discount)}</span></div>}
              <div className="flex justify-between font-bold text-xl pt-2 border-t border-slate-200 text-slate-900"><span>Total</span><span className="text-teal-600">{gbp(total)}</span></div>
            </div>
            {err && <div className="text-red-400 text-sm">{err}</div>}
            <button type="submit" className="w-full rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold py-3 text-sm" disabled={loading}>
              {loading ? 'Processing…' : `Pay ${gbp(total)}`}
            </button>
            <p className="text-[11px] text-slate-400 text-center">By paying you confirm you are 18+. In-store Challenge 25 applies.</p>
          </div>
        </aside>
      </form>
    </div>
  );
}
