'use client';
import { useEffect, useMemo, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { gbp } from '@/lib/format';
import { useStore } from '@/lib/store';

type QuoteLine = { variantId: number; productName: string; variantLabel: string; quantity: number; unitPrice: number; lineTotal: number; available: number };
type Quote = {
  items: QuoteLine[]; subtotal: number; shipping: number; discount: number; total: number;
  promoCode: string | null; stockIssues: { message: string; variantId: number }[];
  rules: { shippingFlat: number; freeShippingThreshold: number };
};
type FieldErrors = Record<string, string>;

const inputCls = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#64B5F6] aria-[invalid=true]:border-red-700';
const labelCls = 'block text-sm font-bold text-slate-800';
const errCls = 'mt-1 text-sm font-semibold text-red-800';

// Postcode check that matches the server: UK format, spaces optional.
const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, clearCart, user } = useStore();
  const [mode, setMode] = useState<'delivery' | 'collect'>('delivery');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [county, setCounty] = useState('');
  const [postcode, setPostcode] = useState('');
  const [dob, setDob] = useState('');
  const [compliance, setCompliance] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoErr, setPromoErr] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<FieldErrors>({});
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cardNum, setCardNum] = useState('4242 4242 4242 4242');
  const [cardExp, setCardExp] = useState('12/30');
  const [cardCvc, setCardCvc] = useState('123');
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;

  const items = useMemo(() => cart.map((l) => ({ variantId: Number(l.variantId), quantity: l.quantity })).filter((l) => !isNaN(l.variantId)), [cart]);
  const basketKey = JSON.stringify(items);

  // Pre-fill email and name for signed-in customers.
  useEffect(() => {
    if (user) {
      setEmail((e) => e || user.email || '');
      setName((n) => n || user.fullName || '');
    }
  }, [user]);

  // Send the basket to the server, then ask for the quote. The server prices the order,
  // so the total shown here is the total charged.
  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;
    (async () => {
      try {
        await fetch('/api/cart', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: items }) });
        const r = await fetch('/api/checkout/quote', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode, promoCode: appliedPromo }),
        });
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          if (appliedPromo) {
            setAppliedPromo(null);
            setPromoErr(d.error || 'That promo code no longer applies.');
            setQuote(null);
          } else {
            setQuoteErr(d.error || 'We could not work out your total. Please try again.');
            setQuote(null);
          }
          return;
        }
        setQuoteErr(null);
        setPromoErr(null);
        setQuote(d as Quote);
      } catch {
        if (!cancelled) setQuoteErr('We could not reach the server to work out your total. Check your connection.');
      }
    })();
    return () => { cancelled = true; };
    // basketKey captures the basket contents, so the effect runs when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basketKey, mode, appliedPromo]);

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) { setPromoErr('Enter a promo code.'); return; }
    setPromoErr(null);
    setAppliedPromo(code);
  };

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter an email address, such as name@example.com.';
    if (mode === 'delivery') {
      if (name.trim().length < 2) e.name = 'Enter the name of the person receiving the order.';
      if (line1.trim().length < 2) e.line1 = 'Enter address line 1.';
      if (city.trim().length < 2) e.city = 'Enter the town or city.';
      if (!POSTCODE_RE.test(postcode.trim())) e.postcode = 'Enter a valid UK postcode, such as KT9 2RT.';
    }
    if (!dob) e.dob = 'Enter your date of birth.';
    if (!compliance) e.compliance = 'Tick the box to confirm you are 18 or over.';
    return e;
  };

  const place = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitErr(null);
    const errs = validate();
    setFieldErr(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      setSubmitErr('Please fix the highlighted fields.');
      document.getElementById(id(first))?.focus();
      return;
    }
    if (!quote || quote.stockIssues.length) {
      setSubmitErr(quote?.stockIssues[0]?.message || 'We are still working out your total. Please wait a moment.');
      return;
    }
    setSubmitting(true);
    try {
      const body: any = { mode, dob, compliance, promoCode: appliedPromo, email: email.trim() };
      if (mode === 'delivery') body.shippingAddress = { name: name.trim(), line1: line1.trim(), line2: line2.trim(), city: city.trim(), county: county.trim(), postcode: postcode.trim() };
      const r = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const issues = d.issues?.fieldErrors as Record<string, string[]> | undefined;
        if (issues) {
          const map: FieldErrors = {};
          for (const [k, msgs] of Object.entries(issues)) if (msgs?.[0]) map[k === 'shippingAddress' ? 'line1' : k] = msgs[0];
          setFieldErr((prev) => ({ ...prev, ...map }));
        }
        setSubmitErr(d.error || 'We could not place your order. Please try again.');
        return;
      }
      const cap = await fetch(`/api/checkout/${d.orderId}/capture`, { method: 'POST' });
      const cd = await cap.json().catch(() => ({}));
      if (!cap.ok) { setSubmitErr(cd.error || 'Your payment did not go through. You have not been charged. Please try again.'); return; }
      clearCart();
      await fetch('/api/cart', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: [] }) });
      router.push(`/order/${d.orderId}`);
      router.refresh();
    } catch {
      setSubmitErr('Something went wrong sending your order. Check your connection, then try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0 && !submitting) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black text-slate-900">Your basket is empty</h1>
        <p className="mt-2 text-slate-700">Add something from the shop to check out.</p>
        <a href="/shop" className="mt-4 inline-block rounded-xl bg-white border-2 border-[#1976D2] text-[#1565C0] hover:bg-[#1976D2] hover:text-white font-extrabold px-4 py-2">Go to the shop</a>
      </div>
    );
  }

  const shippingLabel = !quote ? '—' : quote.shipping === 0 ? (mode === 'collect' ? 'Free (collect)' : 'Free delivery') : gbp(quote.shipping);
  const blocked = !quote || quote.stockIssues.length > 0 || submitting;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 md:pb-6">
      <h1 className="text-3xl font-black text-slate-900">Checkout</h1>
      <p className="text-sm text-slate-700 mt-1">Guest checkout is fine — you do not need an account.</p>

      {(quoteErr || quote?.stockIssues.length) ? (
        <div role="alert" className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {quoteErr && <p>{quoteErr}</p>}
          {quote?.stockIssues.map((s) => <p key={s.variantId}>{s.message} <a className="underline font-bold" href="/shop">Back to basket</a></p>)}
        </div>
      ) : null}

      <form onSubmit={place} noValidate className="grid md:grid-cols-[1fr_360px] gap-6 mt-6">
        <div className="space-y-6">
          <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <legend className="font-extrabold text-slate-900 px-1">How do you want your order?</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                ['delivery', 'Delivery', quote ? (quote.shipping === 0 && quote.subtotal >= quote.rules.freeShippingThreshold ? 'Free delivery' : `${gbp(quote.rules.shippingFlat)} · free over ${gbp(quote.rules.freeShippingThreshold)}`) : `${gbp(3.99)} · free over £30`],
                ['collect', 'Click & Collect', 'Free · Bridge Road, Chessington. Ready same day when in stock.'],
              ] as const).map(([val, title, sub]) => (
                <label key={val} className={`rounded-xl border p-4 cursor-pointer transition flex gap-3 ${mode === val ? 'border-[#1976D2] bg-sky-50' : 'border-slate-300 hover:border-[#64B5F6]'}`}>
                  <input type="radio" name="mode" className="mt-1 h-4 w-4" value={val} checked={mode === val} onChange={() => setMode(val)} />
                  <span>
                    <span className="block font-bold text-slate-900">{title}</span>
                    <span className="block text-sm text-slate-700 mt-0.5">{sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4" aria-labelledby={id('contact-h')}>
            <h2 id={id('contact-h')} className="font-extrabold text-slate-900">Your details</h2>
            <div>
              <label htmlFor={id('email')} className={labelCls}>Email address <span className="font-normal text-slate-700">(we send your confirmation here)</span></label>
              <input id={id('email')} type="email" inputMode="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} aria-describedby={fieldErr.email ? id('email-err') : undefined} />
              {fieldErr.email && <p id={id('email-err')} className={errCls}>{fieldErr.email}</p>}
            </div>

            {mode === 'delivery' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor={id('name')} className={labelCls}>Recipient name</label>
                  <input id={id('name')} autoComplete="name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!fieldErr.name} aria-describedby={fieldErr.name ? id('name-err') : undefined} />
                  {fieldErr.name && <p id={id('name-err')} className={errCls}>{fieldErr.name}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={id('line1')} className={labelCls}>Address line 1</label>
                  <input id={id('line1')} autoComplete="address-line1" className={inputCls} value={line1} onChange={(e) => setLine1(e.target.value)} aria-invalid={!!fieldErr.line1} aria-describedby={fieldErr.line1 ? id('line1-err') : undefined} />
                  {fieldErr.line1 && <p id={id('line1-err')} className={errCls}>{fieldErr.line1}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={id('line2')} className={labelCls}>Address line 2 <span className="font-normal text-slate-700">(optional)</span></label>
                  <input id={id('line2')} autoComplete="address-line2" className={inputCls} value={line2} onChange={(e) => setLine2(e.target.value)} />
                </div>
                <div>
                  <label htmlFor={id('city')} className={labelCls}>Town or city</label>
                  <input id={id('city')} autoComplete="address-level2" className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} aria-invalid={!!fieldErr.city} aria-describedby={fieldErr.city ? id('city-err') : undefined} />
                  {fieldErr.city && <p id={id('city-err')} className={errCls}>{fieldErr.city}</p>}
                </div>
                <div>
                  <label htmlFor={id('county')} className={labelCls}>County <span className="font-normal text-slate-700">(optional)</span></label>
                  <input id={id('county')} autoComplete="address-level1" className={inputCls} value={county} onChange={(e) => setCounty(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={id('postcode')} className={labelCls}>Postcode</label>
                  <input id={id('postcode')} autoComplete="postal-code" className={`${inputCls} uppercase max-w-xs`} value={postcode} onChange={(e) => setPostcode(e.target.value)} aria-invalid={!!fieldErr.postcode} aria-describedby={fieldErr.postcode ? id('postcode-err') : undefined} />
                  {fieldErr.postcode && <p id={id('postcode-err')} className={errCls}>{fieldErr.postcode}</p>}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4" aria-labelledby={id('age-h')}>
            <h2 id={id('age-h')} className="font-extrabold text-slate-900">Age check</h2>
            <p className="text-sm text-slate-700">UK law says you must be 18 or over to buy nicotine and vape products. This is a declaration, not an ID check. We check ID when you collect or receive your order, and we may refuse the order if we cannot confirm your age then.</p>
            <div>
              <label htmlFor={id('dob')} className={labelCls}>Date of birth</label>
              <input id={id('dob')} type="date" autoComplete="bday" className={`${inputCls} max-w-xs`} value={dob} onChange={(e) => setDob(e.target.value)} aria-invalid={!!fieldErr.dob} aria-describedby={fieldErr.dob ? id('dob-err') : undefined} />
              {fieldErr.dob && <p id={id('dob-err')} className={errCls}>{fieldErr.dob}</p>}
            </div>
            <div>
              <label className="flex gap-3 text-sm text-slate-900 items-start">
                <input id={id('compliance')} type="checkbox" className="mt-1 h-4 w-4" checked={compliance} onChange={(e) => setCompliance(e.target.checked)} aria-invalid={!!fieldErr.compliance} aria-describedby={fieldErr.compliance ? id('compliance-err') : undefined} />
                <span>I confirm I am 18 or over, the details I have given are correct, and I understand nicotine is addictive. I know I must show photo ID on collection or delivery.</span>
              </label>
              {fieldErr.compliance && <p id={id('compliance-err')} className={errCls}>{fieldErr.compliance}</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" aria-labelledby={id('pay-h')}>
            <h2 id={id('pay-h')} className="font-extrabold text-slate-900">Payment</h2>
            <p className="text-sm text-slate-700">This site is in test mode, so no real card is charged. Use the test card shown.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3"><label htmlFor={id('card')} className={labelCls}>Card number</label><input id={id('card')} inputMode="numeric" autoComplete="cc-number" className={inputCls} value={cardNum} onChange={(e) => setCardNum(e.target.value)} /></div>
              <div><label htmlFor={id('exp')} className={labelCls}>Expiry (MM/YY)</label><input id={id('exp')} autoComplete="cc-exp" className={inputCls} value={cardExp} onChange={(e) => setCardExp(e.target.value)} /></div>
              <div><label htmlFor={id('cvc')} className={labelCls}>Security code</label><input id={id('cvc')} inputMode="numeric" autoComplete="cc-csc" className={inputCls} value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} /></div>
            </div>
          </section>
        </div>

        <aside className="space-y-4 md:sticky md:top-24 md:self-start" aria-labelledby={id('sum-h')}>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 id={id('sum-h')} className="font-extrabold text-slate-900">Order summary</h2>
            <ul className="divide-y divide-slate-200 text-sm">
              {(quote?.items ?? items.map((i) => ({ ...i, productName: '', variantLabel: '', unitPrice: 0, lineTotal: 0, available: 0 }))).map((i) => {
                const local = cart.find((c) => Number(c.variantId) === i.variantId);
                const name = quote ? i.productName : local?.name;
                const label = quote ? i.variantLabel : local?.variantLabel;
                return (
                  <li key={i.variantId} className="py-2 flex justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-900">{name}</div>
                      <div className="text-xs text-slate-700">{label} × {i.quantity}</div>
                    </div>
                    <div className="text-slate-900 font-semibold">{quote ? gbp(i.lineTotal) : '…'}</div>
                  </li>
                );
              })}
            </ul>

            <div>
              <label htmlFor={id('promo')} className={labelCls}>Promo code</label>
              <div className="flex gap-2 mt-1">
                <input id={id('promo')} className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-[#64B5F6]" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} aria-describedby={promoErr ? id('promo-err') : undefined} />
                <button type="button" onClick={applyPromo} className="rounded-xl border border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100">Apply</button>
              </div>
              {promoErr && <p id={id('promo-err')} role="alert" className={errCls}>{promoErr}</p>}
              {appliedPromo && quote?.promoCode && <p className="mt-1 text-sm font-semibold text-emerald-900">Code {quote.promoCode} applied.</p>}
            </div>

            <dl className="border-t border-slate-200 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-800"><dt>Subtotal</dt><dd>{quote ? gbp(quote.subtotal) : '…'}</dd></div>
              <div className="flex justify-between text-slate-800"><dt>{mode === 'collect' ? 'Collection' : 'Delivery'}</dt><dd>{shippingLabel}</dd></div>
              {quote && quote.discount > 0 && <div className="flex justify-between text-slate-900"><dt>Discount</dt><dd>−{gbp(quote.discount)}</dd></div>}
              <div className="flex justify-between font-black text-xl pt-2 border-t border-slate-200 text-slate-900"><dt>Total</dt><dd>{quote ? gbp(quote.total) : '…'}</dd></div>
            </dl>

            {submitErr && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">{submitErr}</div>}

            <div className="fixed md:static bottom-0 inset-x-0 bg-white md:bg-transparent p-3 md:p-0 border-t md:border-0 border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:shadow-none z-40">
              <button type="submit" disabled={blocked}
                className="w-full rounded-xl bg-[#1976D2] hover:bg-[#1565C0] text-white font-extrabold py-3 text-base disabled:bg-slate-300 disabled:text-slate-700 disabled:cursor-not-allowed">
                {submitting ? 'Placing your order…' : quote ? `Pay ${gbp(quote.total)}` : 'Working out total…'}
              </button>
            </div>
            <p className="text-xs text-slate-700 text-center">By paying you confirm you are 18 or over. Challenge 25 applies in store.</p>
          </div>
        </aside>
      </form>
    </div>
  );
}
