import Link from 'next/link';
import { BRAND, fullAddress } from '@/lib/brand';

export const metadata = { title: 'Returns & refunds' };

export default function ReturnsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 text-slate-800 leading-relaxed">
      <h1 className="text-3xl font-black text-slate-900">Returns &amp; refunds</h1>
      <p className="mt-2 text-slate-700">Your rights are set out below. Nothing here takes away your legal rights.</p>

      <section className="mt-8 space-y-3" aria-labelledby="faulty-h">
        <h2 id="faulty-h" className="text-xl font-extrabold text-slate-900">Faulty or damaged items</h2>
        <p>If an item is faulty, damaged or not as described, contact us as soon as possible. Under the Consumer Rights Act 2015 you can ask for a refund, a repair or a replacement. We cover the cost of returning faulty items.</p>
        <p>Please keep the packaging and your order number, and tell us what is wrong with the item.</p>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="change-h">
        <h2 id="change-h" className="text-xl font-extrabold text-slate-900">Changed your mind</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>For online orders you have 14 days from delivery to cancel, and we refund the price you paid, including delivery.</li>
          <li>The item must be unopened and in its original sealed packaging.</li>
          <li>For health and hygiene reasons we cannot accept the return of opened or unsealed nicotine products, e-liquids, coils, or batteries.</li>
          <li>You pay the return postage for a change of mind unless we agree otherwise.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="how-h">
        <h2 id="how-h" className="text-xl font-extrabold text-slate-900">How to return an item</h2>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Contact us by email at <a className="underline font-semibold" href={`mailto:${BRAND.email}`}>{BRAND.email}</a> or call <a className="underline font-semibold" href={BRAND.phoneHref}>{BRAND.phone}</a>, quoting your order number.</li>
          <li>Send the item back to us, or bring it to the shop: {fullAddress}.</li>
          <li>We refund the original payment method, usually within 14 days of receiving the item.</li>
        </ol>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="collect-h">
        <h2 id="collect-h" className="text-xl font-extrabold text-slate-900">Click &amp; Collect orders</h2>
        <p>You can return items to the shop in person during opening hours. Please bring your order number and photo ID.</p>
      </section>

      <p className="mt-10 text-sm text-slate-700">See also <Link className="underline font-semibold" href="/delivery">Delivery &amp; collection</Link> and <Link className="underline font-semibold" href="/privacy">Privacy</Link>.</p>
    </article>
  );
}
