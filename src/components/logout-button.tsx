'use client';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

export function LogoutButton() {
  const router = useRouter();
  const { logout } = useStore();
  return (
    <button
      onClick={async () => { await logout(); router.refresh(); router.push('/'); }}
      className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-bold hover:bg-slate-100"
    >
      Log out
    </button>
  );
}
