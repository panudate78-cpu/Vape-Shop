import { BRAND, fullAddress } from '@/lib/brand';

// Shown to customers while maintenance mode is on. Staff never see this page.
export function MaintenancePage() {
  return (
    <main className="flex-1 grid place-items-center px-4 py-16 bg-white">
      <section className="max-w-xl text-center space-y-4" aria-labelledby="maint-h">
        <p className="text-sm font-bold uppercase tracking-wide text-[#1565C0]">{BRAND.fullName}</p>
        <h1 id="maint-h" className="text-3xl md:text-4xl font-black text-slate-900">We are updating the website</h1>
        <p className="text-slate-700 text-lg">
          Our online shop is paused while we make some changes. Please check back shortly.
        </p>
        <p className="text-slate-700">
          You can still visit us at {fullAddress}, or call <a className="underline font-bold" href={BRAND.phoneHref}>{BRAND.phone}</a>.
        </p>
        <p className="text-sm text-slate-600">
          Nicotine is addictive. Adults 18+ only.
        </p>
      </section>
    </main>
  );
}
