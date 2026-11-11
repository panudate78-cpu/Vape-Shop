import { BRAND, fullAddress } from '@/lib/brand';

export const metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 text-slate-800 leading-relaxed">
      <h1 className="text-3xl font-black text-slate-900">Privacy</h1>
      <p className="mt-2 text-slate-700">How we use your personal information when you shop with us, send us a message, or track an order.</p>

      <section className="mt-8 space-y-3" aria-labelledby="who-h">
        <h2 id="who-h" className="text-xl font-extrabold text-slate-900">Who we are</h2>
        <p>{BRAND.fullName}, {fullAddress}. Email <a className="underline font-semibold" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>, phone {BRAND.phone}.</p>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="collect-h">
        <h2 id="collect-h" className="text-xl font-extrabold text-slate-900">What we collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Orders:</strong> your name, email address, delivery address (if delivery), what you bought, and the price paid.</li>
          <li><strong>Age checks:</strong> your date of birth, which you declare at checkout, and any photo ID checks we record when you collect or receive an order.</li>
          <li><strong>Accounts:</strong> if you create an account, your name, email address, date of birth and a password (stored only in scrambled form).</li>
          <li><strong>Messages:</strong> anything you send us through the contact form or by email.</li>
          <li><strong>Payments:</strong> card details are handled by our payment provider. We do not store full card numbers.</li>
          <li><strong>Cookies and storage:</strong> a session cookie that keeps you signed in and remembers your basket on the server, and your basket saved in your browser. We do not use advertising cookies.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="why-h">
        <h2 id="why-h" className="text-xl font-extrabold text-slate-900">Why we use it</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>To take and deliver your order, and to send your confirmation and collection emails.</li>
          <li>To check you are old enough to buy nicotine and vape products, and to keep the records the law requires.</li>
          <li>To keep accounting records and deal with tax obligations.</li>
          <li>To answer your messages and handle returns, refunds and faults.</li>
        </ul>
        <p>We will only send you marketing email if you have agreed to receive it, and you can stop at any time.</p>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="share-h">
        <h2 id="share-h" className="text-xl font-extrabold text-slate-900">Who we share it with</h2>
        <p>We share information only with the services we need to run the shop: our hosting provider, our email provider, our payment provider, and couriers for delivery orders. We do not sell your information.</p>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="keep-h">
        <h2 id="keep-h" className="text-xl font-extrabold text-slate-900">How long we keep it</h2>
        <p>Order and accounting records are kept for as long as tax and accounting law requires. Age-check records are kept for as long as needed to show we met our legal duties. You can ask us to delete an account you no longer use, but we must keep records we are legally required to hold.</p>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="rights-h">
        <h2 id="rights-h" className="text-xl font-extrabold text-slate-900">Your rights</h2>
        <p>You can ask us for a copy of your information, ask us to correct it, ask us to delete it where the law allows, or object to how we use it. To do this, email <a className="underline font-semibold" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>. If you are unhappy with how we handle your information, you can complain to the Information Commissioner's Office at ico.org.uk.</p>
      </section>
    </article>
  );
}
