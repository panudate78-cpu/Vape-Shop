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
      <div className="bg-amber-500 text-zinc-950 text-center text-xs md:text-sm font-semibold py-1 px-3">
        ⚠️ This product contains nicotine. Nicotine is an addictive chemical. Adults 18+ only.
      </div>
      <header className="sticky top-0 z-30 bg-black/95 backdrop-blur border-b border-white/10">
        <div className="bg-teal-500 text-zinc-950 text-xs md:text-sm text-center py-1 font-semibold">
          {fullAddress} · Same-day Click & Collect · Call <a href={BRAND.phoneHref} className="underline">{BRAND.phone}</a>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 relative">
          <Link href="/" aria-label="Dr Cloud — home" className="flex items-center shrink-0">
            <Logo height={56} onDark />
          </Link>
          <nav className="hidden md:flex gap-4 text-sm ml-2">
            <Link href="/shop" className="hover:text-teal-300">Shop</Link>
            <Link href="/visit" className="hover:text-teal-300">Visit</Link>
            <Link href="/track" className="hover:text-teal-300">Track</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <StoreNavUser user={user} />
            <CartButton />
            <MobileNav />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">{children}</main>

      <CartDrawer />

      <footer className="border-t border-white/10 mt-12 bg-black">
        <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-3 gap-8 text-sm">
          <div>
            <div className="flex items-center gap-3">
              <Logo height={80} onDark />
              <div className="font-bold text-lg text-teal-400 leading-tight">{BRAND.fullName}<div className="text-xs font-medium text-zinc-400">{BRAND.tagline}</div></div>
            </div>
            <p className="mt-3 text-zinc-400">{fullAddress}</p>
            <p className="text-zinc-400">Tel: <a className="underline" href={BRAND.phoneHref}>{BRAND.phone}</a></p>
            <p className="text-zinc-400">Email: <a className="underline" href={`mailto:${BRAND.email}`}>{BRAND.email}</a></p>
          </div>
          <div>
            <div className="font-semibold text-zinc-200">Opening Hours</div>
            <ul className="mt-2 space-y-1 text-zinc-400">
              {BRAND.hours.map((h) => <li key={h.day}>{h.day}: {h.time}</li>)}
            </ul>
            <Link href="/visit" className="rounded-xl border border-white/15 px-4 py-2 text-xs font-extrabold text-white inline-block mt-4 hover:bg-white/5">Directions & Click & Collect</Link>
          </div>
          <div>
            <div className="font-semibold text-zinc-200">Important</div>
            <ul className="mt-2 space-y-1 text-zinc-400">
              <li>You must be 18 or over to purchase.</li>
              <li>Challenge 25 — ID may be required on collection.</li>
              <li>Keep out of reach of children and pets.</li>
            </ul>
            <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/15 px-4 py-2 text-xs font-extrabold text-white inline-block mt-4 hover:bg-white/5">Open in Google Maps</a>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-zinc-500 flex flex-wrap items-center justify-center gap-3">
          <span>© {new Date().getFullYear()} {BRAND.fullName}. All rights reserved. 18+ only.</span>
          <span className="opacity-40" title="Build version — lets us confirm Vercel is running the latest deploy">v7 · {process.env.NEXT_PUBLIC_BUILD_ID || 'prod'}</span>
        </div>
      </footer>
      <div className="bg-amber-500 text-zinc-950 text-center text-[11px] md:text-xs font-semibold py-2 px-3">
        WARNING: Nicotine is highly addictive. For adults 18+ only. Not for use by non-smokers, pregnant or breastfeeding women, or persons with unstable heart conditions.
      </div>
    </>
  );
}
