import Link from 'next/link';
import { getSession } from '@/lib/session';
import { BRAND, fullAddress, googleMapsUrl } from '@/lib/brand';
import { AgeGate } from './age-gate';
import { LogoutButton } from './logout-button';
import { CartButton } from './cart-button';
import { CartDrawer } from './cart-drawer';
import { StoreNavUser, MobileNav } from './nav-user';
import { Logo } from './logo';

export async function Chrome({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const user = session.user;

  return (
    <>
      <AgeGate />
      <div className="nicotine-banner">
        ⚠️ This product contains nicotine. Nicotine is an addictive chemical. Adults 18+ only.
      </div>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="bg-[#BBDEFB] text-slate-900 text-xs md:text-sm text-center py-1.5 font-semibold">
          {fullAddress} · Same-day Click & Collect · Call <a href={BRAND.phoneHref} className="underline hover:text-black">{BRAND.phone}</a>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 relative">
          <Link href="/" aria-label="Dr Cloud — home" className="flex items-center shrink-0">
            <Logo height={84} />
          </Link>
          <nav className="hidden md:flex gap-5 text-sm font-medium ml-2 text-slate-700">
            <Link href="/shop" className="hover:text-slate-900 transition">Shop</Link>
            <Link href="/visit" className="hover:text-slate-900 transition">Visit</Link>
            <Link href="/track" className="hover:text-slate-900 transition">Track</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <StoreNavUser user={user} />
            <CartButton />
            <MobileNav />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full bg-slate-50 min-h-[60vh]">{children}</main>

      <CartDrawer />

      <footer className="border-t border-slate-200 mt-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-3 gap-8 text-sm">
          <div>
            <div className="flex items-center gap-3">
              <Logo height={72} />
              <div className="font-bold text-lg text-slate-900 leading-tight">{BRAND.fullName}<div className="text-xs font-medium text-slate-500">{BRAND.tagline}</div></div>
            </div>
            <p className="mt-3 text-slate-600">{fullAddress}</p>
            <p className="text-slate-600">Tel: <a className="underline text-slate-900 hover:text-black" href={BRAND.phoneHref}>{BRAND.phone}</a></p>
            <p className="text-slate-600">Email: <a className="underline text-slate-900 hover:text-black" href={`mailto:${BRAND.email}`}>{BRAND.email}</a></p>
          </div>
          <div>
            <div className="font-semibold text-slate-900">Opening Hours</div>
            <ul className="mt-2 space-y-1 text-slate-600">
              {BRAND.hours.map((h) => <li key={h.day}>{h.day}: {h.time}</li>)}
            </ul>
            <Link href="/visit" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-slate-900 inline-block mt-4 hover:bg-slate-50 hover:border-[#BBDEFB] transition">Directions & Click & Collect</Link>
          </div>
          <div>
            <div className="font-semibold text-slate-900">Important</div>
            <ul className="mt-2 space-y-1 text-slate-600">
              <li>You must be 18 or over to purchase.</li>
              <li>Challenge 25 — ID may be required on collection.</li>
              <li>Keep out of reach of children and pets.</li>
            </ul>
            <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-slate-900 inline-block mt-4 hover:bg-slate-50 hover:border-[#BBDEFB] transition">Open in Google Maps</a>
          </div>
        </div>
        <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-500 flex flex-wrap items-center justify-center gap-3 bg-slate-50">
          <span>© {new Date().getFullYear()} {BRAND.fullName}. All rights reserved. 18+ only.</span>
          <span className="opacity-50">v7 · {process.env.NEXT_PUBLIC_BUILD_ID || 'prod'}</span>
        </div>
      </footer>
      <div className="nicotine-banner">
        WARNING: Nicotine is highly addictive. For adults 18+ only. Not for use by non-smokers, pregnant or breastfeeding women, or persons with unstable heart conditions.
      </div>
    </>
  );
}
