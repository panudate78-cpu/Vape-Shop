'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { LogoutButton } from './logout-button';

type User = { id: number; email: string; role: string; fullName?: string };
export function StoreNavUser({ user }: { user?: User }) {
  useStore(); // subscribe so rerenders on cart/store changes
  if (user) {
    const isAdmin = user.role === 'ADMIN';
    const accountHref = isAdmin ? '/admin' : '/account';
    const accountLabel = isAdmin ? 'Admin' : (user.fullName || user.email);
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="hidden sm:flex items-center gap-2">
          <Link href={accountHref} className={isAdmin ? 'rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-black text-black hover:bg-amber-300' : 'hover:text-teal-300'}>
            {isAdmin ? '🛠 Admin' : accountLabel}
          </Link>
          <LogoutButton />
        </div>
        <Link
          href={accountHref}
          className="sm:hidden rounded-lg border border-white/20 w-9 h-9 flex items-center justify-center text-white hover:bg-white/10"
          aria-label={isAdmin ? 'Admin dashboard' : 'Account'}
          title={user.email}
        >
          {isAdmin ? '🛠' : '👤'}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="hidden sm:flex items-center gap-2">
        <Link href="/login" className="hover:text-teal-300">Login</Link>
        <Link href="/register" className="rounded-xl bg-teal-500 px-3 py-1.5 text-sm font-extrabold text-black hover:bg-teal-400">Sign up</Link>
      </div>
      <Link
        href="/login"
        className="sm:hidden rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-extrabold text-black hover:bg-teal-400"
      >
        Login
      </Link>
    </div>
  );
}

/**
 * Mobile hamburger menu. Rendered fixed so it always sits on top of page content
 * with a fully opaque panel + dim backdrop — no text bleeding through.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Lock body scroll while the menu is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="md:hidden ml-1 rounded-lg border border-white/20 w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 shrink-0"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? '✕' : '☰'}
      </button>
      {open && (
        <>
          {/* Dim backdrop — clicks outside close the menu */}
          <div
            className="md:hidden fixed inset-0 bg-black/70 z-[60]"
            onClick={close}
            aria-hidden
          />
          {/* Opaque menu panel — anchored just under the sticky header */}
          <div className="md:hidden fixed inset-x-0 top-[112px] z-[70] bg-black border-b border-white/10 shadow-2xl">
            <nav className="flex flex-col px-4">
              <Link href="/shop" onClick={close} className="py-4 text-lg border-b border-white/10 text-white hover:text-teal-300">Shop</Link>
              <Link href="/visit" onClick={close} className="py-4 text-lg border-b border-white/10 text-white hover:text-teal-300">Visit</Link>
              <Link href="/track" onClick={close} className="py-4 text-lg border-b border-white/10 text-white hover:text-teal-300">Track my order</Link>
              <Link href="/login" onClick={close} className="py-4 text-lg text-white hover:text-teal-300">Login / Sign up</Link>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
