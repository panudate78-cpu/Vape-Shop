'use client';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.refresh(); router.push('/'); }}
      className="btn-outline py-1 px-3 text-sm"
    >
      Log out
    </button>
  );
}
