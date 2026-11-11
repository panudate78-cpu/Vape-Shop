import Link from 'next/link';
import { BRAND, fullAddress } from '@/lib/brand';

export const metadata = { title: 'Delivery & collection' };

export default function DeliveryPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 text-slate-800 leading-relaxed">
      <h1 className="text-3xl font-black text-slate-900">Delivery &amp; collection</h1>
      <p className="mt-2 text-slate-700">Two ways to get your order: have it delivered, or collect it from our shop. Both need proof of age.</p>

      <section className="mt-8 space-y-3" aria-labelledby="delivery-h">
        <h2 id="delivery-h" className="text-xl font-extrabold text-slate-900">Delivery</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Delivery costs <strong>£3.99</strong>. It is <strong>free on orders of £30 or more</strong> (before any discount code).</li>
          <li>Enter the full address, including the recipient name and a valid UK postcode, at checkout.</li>
          <li>We email a confirmation when your order is placed.</li>
          <li>Photo ID is checked on delivery. If the person receiving the order is under 18 or cannot show ID, we cannot hand the order over.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="collect-h">
        <h2 id="collect-h" className="text-xl font-extrabold text-slate-900">Click &amp; Collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Collection is <strong>free</strong>.</li>
          <li>Collect from: {fullAddress}.</li>
          <li>We email you when your order is ready. Please bring <strong>photo ID</strong> (Challenge 25) and your order number.</li>
          <li>Opening hours: {BRAND.hours.map((h) => `${h.day} ${h.time}`).join('; ')}.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="age-h">
        <h2 id="age-h" className="text-xl font-extrabold text-slate-900">Age checks</h2>
        <p>You must be 18 or over to buy nicotine or vape products. Our checkout asks you to confirm your date of birth, and we check photo ID when you collect or receive your order. We may refuse an order if we cannot confirm your age at that point.</p>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="track-h">
        <h2 id="track-h" className="text-xl font-extrabold text-slate-900">Tracking your order</h2>
        <p>Enter your order number and the email address you used at checkout on the <Link className="underline font-semibold" href="/track">Track an order</Link> page. Questions? <Link className="underline font-semibold" href="/contact">Contact us</Link>.</p>
      </section>
    </article>
  );
}
