'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { LogoutButton } from './logout-button';

type User = { id: number; email: string; role: string; fullName?: string };
export function StoreNavUser({ user }: { user?: User }) {
  useStore(); // subscribe so rerenders on cart/store changes
  if (user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {/* Desktop: full name + logout */}
        <div className="hidden sm:flex items-center gap-2">
          <Link href="/account" className="hover:text-teal-300">{user.fullName || user.email}</Link>
          <LogoutButton />
        </div>
        {/* Mobile: just an 👤 account icon link */}
        <Link
          href="/account"
          className="sm:hidden rounded-lg border border-white/20 w-9 h-9 flex items-center justify-center text-white hover:bg-white/10"
          aria-label="Account"
          title={user.email}
        >
          👤
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      {/* Desktop: Login link + Sign up button */}
      <div className="hidden sm:flex items-center gap-2">
        <Link href="/login" className="hover:text-teal-300">Login</Link>
        <Link href="/register" className="rounded-xl bg-teal-500 px-3 py-1.5 text-sm font-extrabold text-black hover:bg-teal-400">Sign up</Link>
      </div>
      {/* Mobile: single compact Login button (Sign up is on the login page too) */}
      <Link
        href="/login"
        className="sm:hidden rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-extrabold text-black hover:bg-teal-400"
      >
        Login
      </Link>
    </div>
  );
}

/** Mobile hamburger menu with Shop/Visit/Track links (the desktop nav is hidden < md). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="md:hidden ml-1 rounded-lg border border-white/20 w-9 h-9 flex items-center justify-center text-white hover:bg-white/10"
        aria-label="Menu"
        aria-expanded={open}
      >
        {open ? '✕' : '☰'}
      </button>
      {open && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-black/98 border-b border-white/10 backdrop-blur">
          <nav className="flex flex-col px-4 py-3 text-base">
            <Link href="/shop" onClick={close} className="py-3 border-b border-white/10 hover:text-teal-300">Shop</Link>
            <Link href="/visit" onClick={close} className="py-3 border-b border-white/10 hover:text-teal-300">Visit</Link>
            <Link href="/track" onClick={close} className="py-3 border-b border-white/10 hover:text-teal-300">Track my order</Link>
            <Link href="/login" onClick={close} className="py-3 hover:text-teal-300">Login / Sign up</Link>
          </nav>
        </div>
      )}
    </>
  );
}
