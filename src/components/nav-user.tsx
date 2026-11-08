'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { LogoutButton } from './logout-button';

type User = { id: number; email: string; role: string; fullName?: string };
export function StoreNavUser({ user }: { user?: User }) {
  const {} = useStore(); // subscribe so rerenders on cart/store changes
  if (user) {
    return (
      <div className="hidden sm:flex items-center gap-2 text-sm">
        <Link href="/account" className="hover:text-teal-300">{user.fullName || user.email}</Link>
        <LogoutButton />
      </div>
    );
  }
  return (
    <div className="hidden sm:flex items-center gap-2 text-sm">
      <Link href="/login" className="hover:text-teal-300">Login</Link>
      <Link href="/register" className="rounded-xl bg-teal-500 px-3 py-1.5 text-sm font-extrabold text-black hover:bg-teal-400">Sign up</Link>
    </div>
  );
}
