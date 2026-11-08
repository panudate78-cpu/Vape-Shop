'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { LogoutButton } from './logout-button';

type User = { id: number; email: string; role: string; fullName?: string };
export function StoreNavUser({ user }: { user?: User }) {
  useStore();
  if (user) {
    const isAdmin = user.role === 'ADMIN';
    const accountHref = isAdmin ? '/admin' : '/account';
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="hidden sm:flex items-center gap-3">
          <Link href={accountHref} className={isAdmin
            ? 'rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-900 hover:bg-amber-300 transition'
            : 'text-slate-700 hover:text-slate-900 font-medium transition'}>
            {isAdmin ? '🛠 Admin' : (user.fullName || user.email)}
          </Link>
          <LogoutButton />
        </div>
        <Link
          href={accountHref}
          className="sm:hidden rounded-lg border border-slate-300 w-9 h-9 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition"
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
      <div className="hidden sm:flex items-center gap-3">
        <Link href="/login" className="text-slate-700 hover:text-slate-900 font-medium transition">Login</Link>
        <Link href="/register" className="rounded-lg bg-black px-3 py-1.5 text-sm font-bold text-white hover:bg-slate-900 transition shadow-sm">Sign up</Link>
      </div>
      <Link
        href="/login"
        className="sm:hidden rounded-lg bg-black px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900 transition shadow-sm"
      >
        Login
      </Link>
    </div>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
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
        className="md:hidden ml-1 rounded-lg border border-slate-300 w-9 h-9 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition shrink-0"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? '✕' : '☰'}
      </button>
      {open && (
        <>
          <div className="md:hidden fixed inset-0 bg-slate-900/40 z-[60]" onClick={close} aria-hidden />
          <div className="md:hidden fixed inset-x-0 top-[112px] z-[70] bg-white border-b border-slate-200 shadow-xl">
            <nav className="flex flex-col px-4">
              <Link href="/shop" onClick={close} className="py-4 text-lg border-b border-slate-100 text-slate-800 hover:text-slate-900 transition">Shop</Link>
              <Link href="/visit" onClick={close} className="py-4 text-lg border-b border-slate-100 text-slate-800 hover:text-slate-900 transition">Visit</Link>
              <Link href="/track" onClick={close} className="py-4 text-lg border-b border-slate-100 text-slate-800 hover:text-slate-900 transition">Track my order</Link>
              <Link href="/login" onClick={close} className="py-4 text-lg text-slate-800 hover:text-slate-900 transition">Login / Sign up</Link>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
